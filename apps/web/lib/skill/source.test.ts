import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The skill source is configured through `serverConfig()`, which caches on first
 * use, so every case resets the module registry and re-imports with fresh env.
 */
async function loadSource(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("./source");
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Repo mode must work with no database at all.
  delete process.env.DATABASE_URL;
  delete process.env.NETLIFY_DB_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("resolveSkillContent (repo mode)", () => {
  it("reads the vendored skill and keeps its original identity", async () => {
    const source = await loadSource({ SKILL_CONTEXT_MODE: "repo" });
    const skill = await source.resolveSkillContent({ slug: "cn-patent-oa-response", version: "2.0.0" });

    expect(skill).not.toBeNull();
    expect(skill!.origin).toBe("repo");
    expect(skill!.slug).toBe("cn-patent-oa-response");
    expect(skill!.version).toBe("2.0.0");
    // Provenance of the authored skill must survive the runtime re-identification.
    expect(skill!.originalName).toBe("oa-response-cn");
    expect(skill!.originalVersion).toBe("v0.2");

    expect(skill!.files.has("SKILL.md")).toBe(true);
    expect(skill!.files.get("SKILL.md")!.text).toContain("OA答复工作流");
    expect(skill!.files.size).toBeGreaterThanOrEqual(10);
    expect(skill!.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("caches by identity so repeated steps share one read", async () => {
    const source = await loadSource({ SKILL_CONTEXT_MODE: "repo" });
    const first = await source.resolveSkillContent({ version: "2.0.0" });
    const second = await source.resolveSkillContent({ version: "2.0.0" });
    expect(second).toBe(first);
  });

  it("returns null when injection is switched off, which is the V1 behaviour", async () => {
    const source = await loadSource({ SKILL_CONTEXT_MODE: "off" });
    await expect(source.resolveSkillContent({ version: "2.0.0" })).resolves.toBeNull();
  });

  it("fails loudly when the configured directory holds no SKILL.md", async () => {
    const source = await loadSource({ SKILL_CONTEXT_MODE: "repo", SKILL_REPO_DIR: "/tmp/definitely-not-a-skill" });
    await expect(source.resolveSkillContent({ version: "2.0.0" })).rejects.toThrow(/SKILL\.md/);
  });

  it("requires a skill version in db mode instead of guessing", async () => {
    const source = await loadSource({ SKILL_CONTEXT_MODE: "db", DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db" });
    await expect(source.resolveSkillContent({})).rejects.toThrow(/skillVersionId/);
  });
});

describe("resolveSkillRepoDir", () => {
  it("finds the vendored directory from the web package working directory", async () => {
    const source = await loadSource({ SKILL_CONTEXT_MODE: "repo" });
    const dir = source.resolveSkillRepoDir();
    expect(dir.replace(/\\/g, "/")).toMatch(/skills\/oa-response-cn$/);
  });
});
