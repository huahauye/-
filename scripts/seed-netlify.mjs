import postgres from "postgres";

const databaseUrl = process.env.NETLIFY_DB_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("NETLIFY_DB_URL is required.");

const sql = postgres(databaseUrl, { max: 1 });
try {
  const [skill] = await sql`
    INSERT INTO skills(slug, name)
    VALUES('cn-patent-oa-response', '中国发明专利 OA 意见陈述书生成')
    ON CONFLICT(slug) DO UPDATE SET name = excluded.name
    RETURNING id
  `;

  await sql`UPDATE skill_versions SET is_active = false, status = 'ARCHIVED' WHERE skill_id = ${skill.id} AND is_active = true`;
  await sql`
    INSERT INTO skill_versions(
      skill_id, version, status, is_active, bundle_key, bundle_sha256,
      runtime_manifest, created_by, published_at
    ) VALUES(
      ${skill.id}, '1.0.0', 'PUBLISHED', true,
      'skills/seed/cn-patent-oa-response.zip', 'production-seed-v1',
      ${sql.json({
        schemaVersion: "1.0",
        root: "SKILL.md",
        steps: {
          evidence: ["references/evidence-workflow.md"],
          analysis: ["references/novelty-inventive-step.md"],
          drafting: ["references/drafting-and-qa.md"],
          docx: ["references/docx-output.md"]
        }
      })}, null, now()
    )
    ON CONFLICT(skill_id, version) DO UPDATE SET
      status = 'PUBLISHED', is_active = true, published_at = now()
  `;

  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
  for (const [name, purpose] of [
    ["analysis-primary", "ANALYSIS"],
    ["drafting-primary", "DRAFTING"],
    ["qa-primary", "QA"],
    ["classification-primary", "CLASSIFICATION"],
    ["vision-qa-primary", "VISION_QA"]
  ]) {
    await sql`
      INSERT INTO model_profiles(name, purpose, provider, model, secret_ref, enabled, config)
      VALUES(${name}, ${purpose}::model_purpose, 'deepseek', ${model}, 'DEEPSEEK', true, '{}')
      ON CONFLICT(name) DO UPDATE SET
        provider = excluded.provider,
        model = excluded.model,
        secret_ref = excluded.secret_ref,
        enabled = true,
        updated_at = now()
    `;
  }
  console.log("Baseline Skill and DeepSeek model profiles are ready.");
} finally {
  await sql.end();
}
