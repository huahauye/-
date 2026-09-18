import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { inspectSkillZip, runtimeAssetsOnly } from "./index";

describe("skill ZIP importer", () => {
  it("keeps scripts quarantined from runtime context", async () => {
    const zip = new JSZip();
    zip.file("skill/SKILL.md", "# Test");
    zip.file("skill/references/evidence-workflow.md", "evidence");
    zip.file("skill/scripts/run.py", "raise SystemExit()");
    const bundle = await inspectSkillZip(await zip.generateAsync({ type: "uint8array" }));
    expect(bundle.assets.find((asset) => asset.path === "scripts/run.py")?.isExecutable).toBe(true);
    expect(runtimeAssetsOnly(bundle.assets).map((asset) => asset.path)).not.toContain("scripts/run.py");
  });

  it("requires a SKILL.md", async () => {
    const zip = new JSZip();
    zip.file("README.md", "missing");
    await expect(inspectSkillZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow("SKILL_MD_MISSING");
  });
});
