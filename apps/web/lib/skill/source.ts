import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { skills, skillAssets, skillVersions } from "@oa/domain/db";
import { serverConfig } from "../config";
import { getObjectText } from "../storage";

/**
 * Resolves the professional rules of the Skill that a run froze.
 *
 * The workflow previously recorded only `skill_versions.bundle_sha256`, so the
 * skill's text never reached a model call. This module turns a Skill version
 * into usable prompt material, from either of two sources:
 *
 * - `db`   — the imported bundle: text assets uploaded through /admin
 *            (`skill_assets.is_runtime_text`) read back from object storage.
 * - `repo` — the copy vendored under `skills/<dir>/` in this repository, which
 *            keeps local development and tests independent of the database.
 *
 * `off` disables injection entirely and reproduces the V1 prompts byte for byte.
 */

export interface SkillFile {
  /** Path inside the skill bundle, e.g. `references/claim_amendment.md`. */
  path: string;
  text: string;
  sha256: string;
  bytes: number;
}

export interface ResolvedSkill {
  /** Runtime identity (`skills.slug`), e.g. `cn-patent-oa-response`. */
  slug: string;
  /** Runtime version, e.g. `2.0.0`. */
  version: string;
  /** Original identity of the authored skill, e.g. `oa-response-cn` `v0.2`. */
  originalName?: string;
  originalVersion?: string;
  origin: "db" | "repo";
  files: Map<string, SkillFile>;
  /** Hash over the identity plus every file digest — the evidence that a call used these rules. */
  hash: string;
}

/** Only text formats ever reach a prompt; binaries (templates, images) are ignored. */
const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml"]);
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 200;
const DEFAULT_SKILL_DIR = "oa-response-cn";

const cache = new Map<string, Promise<ResolvedSkill | null>>();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(slug: string, version: string, originalName: string | undefined, originalVersion: string | undefined, files: SkillFile[]): string {
  const listing = [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${file.path}:${file.sha256}`)
    .join("\n");
  return sha256(`${slug}@${version}\n${originalName ?? ""}@${originalVersion ?? ""}\n${listing}`);
}

interface SkillManifestInfo {
  originalName?: string | undefined;
  originalVersion?: string | undefined;
  runtimeSlug?: string | undefined;
  runtimeVersion?: string | undefined;
}

/** Reads `runtime-manifest.json` when present to keep the original identity attached. */
async function readManifest(dir: string): Promise<SkillManifestInfo> {
  try {
    const raw = await readFile(resolve(dir, "runtime-manifest.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      originalName: typeof parsed.originalName === "string" ? parsed.originalName : undefined,
      originalVersion: typeof parsed.originalVersion === "string" ? parsed.originalVersion : undefined,
      runtimeSlug: typeof parsed.runtimeSlug === "string" ? parsed.runtimeSlug : undefined,
      runtimeVersion: typeof parsed.runtimeVersion === "string" ? parsed.runtimeVersion : undefined
    };
  } catch {
    return {};
  }
}

/**
 * Finds the vendored skill directory.
 *
 * The web process runs with `apps/web` as its working directory, tests run from
 * the package directory, and the deployed source lives under `/opt/oa-agent`;
 * all three are tried before giving up loudly.
 */
export function resolveSkillRepoDir(): string {
  const config = serverConfig();
  if (config.SKILL_REPO_DIR) {
    const configured = isAbsolute(config.SKILL_REPO_DIR)
      ? config.SKILL_REPO_DIR
      : resolve(process.cwd(), config.SKILL_REPO_DIR);
    if (existsSync(resolve(configured, "SKILL.md"))) return configured;
    throw new Error(`SKILL_REPO_DIR 指向的目录没有 SKILL.md: ${configured}`);
  }
  const candidates = [
    resolve(process.cwd(), "skills", DEFAULT_SKILL_DIR),
    resolve(process.cwd(), "..", "..", "skills", DEFAULT_SKILL_DIR),
    resolve(process.cwd(), "..", "skills", DEFAULT_SKILL_DIR)
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "SKILL.md"))) return candidate;
  }
  throw new Error(`找不到内置 Skill 目录（尝试过：${candidates.join(", ")}）；请设置 SKILL_REPO_DIR 或把 SKILL_CONTEXT_MODE 设为 off`);
}

async function collectRepoFiles(dir: string, prefix = "", collected: SkillFile[] = []): Promise<SkillFile[]> {
  if (collected.length >= MAX_FILES) return collected;
  const entries = await readdir(resolve(dir, prefix), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (collected.length >= MAX_FILES) break;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await collectRepoFiles(dir, relative, collected);
      continue;
    }
    if (relative === "runtime-manifest.json") continue;
    const dot = entry.name.lastIndexOf(".");
    const extension = dot >= 0 ? entry.name.slice(dot).toLowerCase() : "";
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const path = resolve(dir, relative);
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) continue;
    const text = await readFile(path, "utf8");
    collected.push({ path: relative, text, sha256: sha256(text), bytes: info.size });
  }
  return collected;
}

async function loadFromRepo(slug: string, version: string): Promise<ResolvedSkill> {
  const dir = resolveSkillRepoDir();
  const manifest = await readManifest(dir);
  const files = await collectRepoFiles(dir);
  if (files.length === 0) throw new Error(`Skill 目录为空: ${dir}`);
  return {
    slug,
    version,
    ...(manifest.originalName ? { originalName: manifest.originalName } : {}),
    ...(manifest.originalVersion ? { originalVersion: manifest.originalVersion } : {}),
    origin: "repo",
    files: new Map(files.map((file) => [file.path, file])),
    hash: fingerprint(slug, version, manifest.originalName, manifest.originalVersion, files)
  };
}

async function loadFromDb(skillVersionId: string): Promise<ResolvedSkill> {
  // Imported lazily so that `repo` mode never needs a database connection —
  // unit tests and local tooling run with no DATABASE_URL at all.
  const { db } = await import("../db");
  const rows = await db.select({
    asset: skillAssets,
    version: skillVersions.version,
    slug: skills.slug
  }).from(skillAssets)
    .innerJoin(skillVersions, eq(skillVersions.id, skillAssets.skillVersionId))
    .innerJoin(skills, eq(skills.id, skillVersions.skillId))
    .where(and(eq(skillAssets.skillVersionId, skillVersionId), eq(skillAssets.isRuntimeText, true)));

  if (rows.length === 0) {
    throw new Error(`Skill 版本 ${skillVersionId} 没有可作为运行上下文的文本资产；请通过 /admin 导入包含 SKILL.md 的 Skill 包，或把 SKILL_CONTEXT_MODE 设为 repo`);
  }

  const files: SkillFile[] = [];
  for (const row of rows.sort((a, b) => a.asset.path.localeCompare(b.asset.path))) {
    if (files.length >= MAX_FILES) break;
    const text = await getObjectText(row.asset.storageKey);
    files.push({ path: row.asset.path, text, sha256: row.asset.sha256, bytes: text.length });
  }
  const identity = rows[0]!;
  const slug = identity.slug;
  const version = identity.version;
  return {
    slug,
    version,
    origin: "db",
    files: new Map(files.map((file) => [file.path, file])),
    hash: fingerprint(slug, version, undefined, undefined, files)
  };
}

/**
 * Returns the Skill content for a run, or `null` when injection is disabled.
 *
 * Results are cached per source key: a skill version does not change content
 * after publication, and the workflow asks for the same version on every step.
 */
export async function resolveSkillContent(input: { skillVersionId?: string; slug?: string; version?: string }): Promise<ResolvedSkill | null> {
  const config = serverConfig();
  if (config.SKILL_CONTEXT_MODE === "off") return null;

  const slug = input.slug ?? config.ACTIVE_SKILL_SLUG;
  if (config.SKILL_CONTEXT_MODE === "db") {
    if (!input.skillVersionId) throw new Error("SKILL_CONTEXT_MODE=db 需要 skillVersionId");
    const key = `db:${input.skillVersionId}`;
    if (!cache.has(key)) cache.set(key, loadFromDb(input.skillVersionId));
    return cache.get(key)!;
  }

  const key = `repo:${slug}:${input.version ?? "latest"}`;
  if (!cache.has(key)) cache.set(key, loadFromRepo(slug, input.version ?? "2.0.0"));
  return cache.get(key)!;
}

/** Test/CLI helper: forget cached content (e.g. after switching modes in a test). */
export function resetSkillContentCache(): void {
  cache.clear();
}
