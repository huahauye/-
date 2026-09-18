import JSZip from "jszip";

const EXECUTABLE_EXTENSIONS = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".sh", ".ps1", ".bat", ".cmd", ".exe", ".dll", ".so", ".jar"]);
const RUNTIME_TEXT_EXTENSIONS = new Set([".md", ".yaml", ".yml", ".json", ".txt"]);
export const MAX_SKILL_ZIP_BYTES = 20 * 1024 * 1024;
export const MAX_SKILL_FILES = 200;

export interface ImportedSkillAsset {
  path: string;
  bytes: Uint8Array;
  isExecutable: boolean;
  isRuntimeText: boolean;
}

export interface ImportedSkillBundle {
  assets: ImportedSkillAsset[];
  rootPrefix: string;
  manifest: Record<string, unknown>;
}

function normalizedPath(rawPath: string): string {
  const value = rawPath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!value || value.startsWith("/") || value.includes("../") || /^[a-zA-Z]:/.test(value) || value.includes("\0")) {
    throw new Error("SKILL_ZIP_PATH_TRAVERSAL");
  }
  return value;
}

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot).toLowerCase();
}

export async function inspectSkillZip(data: Uint8Array): Promise<ImportedSkillBundle> {
  if (data.byteLength > MAX_SKILL_ZIP_BYTES) throw new Error("SKILL_ZIP_TOO_LARGE");
  const zip = await JSZip.loadAsync(data, { checkCRC32: true, createFolders: false });
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  if (files.length > MAX_SKILL_FILES) throw new Error("SKILL_ZIP_TOO_MANY_FILES");

  const paths = files.map((entry) => normalizedPath(entry.name));
  const skillPath = paths.find((path) => path === "SKILL.md" || path.endsWith("/SKILL.md"));
  if (!skillPath) throw new Error("SKILL_MD_MISSING");
  const rootPrefix = skillPath.slice(0, -"SKILL.md".length);
  const assets: ImportedSkillAsset[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const entry = files[index];
    const path = paths[index];
    if (!entry || !path || !path.startsWith(rootPrefix)) throw new Error("SKILL_ZIP_MULTIPLE_ROOTS");
    const relative = path.slice(rootPrefix.length);
    const ext = extension(relative);
    const isExecutable = EXECUTABLE_EXTENSIONS.has(ext);
    const isRuntimeText = RUNTIME_TEXT_EXTENSIONS.has(ext) && !isExecutable;
    const bytes = await entry.async("uint8array");
    if (isRuntimeText) new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assets.push({ path: relative, bytes, isExecutable, isRuntimeText });
  }

  const manifestAsset = assets.find((asset) => asset.path === "runtime-manifest.json");
  const manifest = manifestAsset
    ? JSON.parse(new TextDecoder().decode(manifestAsset.bytes)) as Record<string, unknown>
    : defaultRuntimeManifest(new Set(assets.map((asset) => asset.path)));
  return { assets, rootPrefix, manifest };
}

export function defaultRuntimeManifest(paths: Set<string>): Record<string, unknown> {
  const include = (candidates: string[]) => candidates.filter((path) => paths.has(path));
  return {
    schemaVersion: "1.0",
    root: "SKILL.md",
    steps: {
      evidence: include(["references/evidence-workflow.md", "references/operating-rules.md"]),
      analysis: include(["references/novelty-inventive-step.md", "references/strategy-and-amendment.md"]),
      drafting: include(["references/drafting-and-qa.md", "references/templates.md"]),
      docx: include(["references/docx-output.md"])
    },
    caseStudies: include(["references/case-study-mp24009825.md", "references/case-study-s22p004184.md"])
  };
}

export function runtimeAssetsOnly(assets: ImportedSkillAsset[]): ImportedSkillAsset[] {
  return assets.filter((asset) => asset.isRuntimeText && !asset.isExecutable);
}
