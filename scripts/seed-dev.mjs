import postgres from "postgres";

if (process.env.NODE_ENV === "production") throw new Error("Development seed must not run in production");
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/oa_agent", { max: 1 });
const userId = process.env.MOCK_USER_ID ?? "00000000-0000-4000-8000-000000000001";
await sql`INSERT INTO app_users(id,identity_user_id,email,role) VALUES(${userId},${`mock:${userId}`},${process.env.MOCK_USER_EMAIL ?? "dev@example.invalid"},'ADMIN') ON CONFLICT(identity_user_id) DO UPDATE SET role='ADMIN'`;
const [skill] = await sql`INSERT INTO skills(slug,name) VALUES('cn-patent-oa-response','中国发明专利 OA 意见陈述书生成') ON CONFLICT(slug) DO UPDATE SET name=excluded.name RETURNING id`;
await sql`UPDATE skill_versions SET is_active=false,status='ARCHIVED' WHERE skill_id=${skill.id} AND is_active=true`;
await sql`INSERT INTO skill_versions(skill_id,version,status,is_active,bundle_key,bundle_sha256,runtime_manifest,created_by,published_at) VALUES(${skill.id},'dev-1.0.0','PUBLISHED',true,'skills/seed/cn-patent-oa-response.zip','development-seed',${sql.json({schemaVersion:"1.0",root:"SKILL.md",steps:{evidence:["references/evidence-workflow.md"],analysis:["references/novelty-inventive-step.md"],drafting:["references/drafting-and-qa.md"],docx:["references/docx-output.md"]}})},${userId},now()) ON CONFLICT(skill_id,version) DO UPDATE SET status='PUBLISHED',is_active=true`;
const useDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY);
const provider = useDeepSeek ? "deepseek" : "mock";
const model = useDeepSeek ? (process.env.DEEPSEEK_MODEL ?? "deepseek-flash") : "mock-structured";
const secretRef = useDeepSeek ? "DEEPSEEK" : "MOCK";
for (const [name,purpose] of [["analysis-primary","ANALYSIS"],["drafting-primary","DRAFTING"],["qa-primary","QA"],["classification-primary","CLASSIFICATION"],["vision-qa-primary","VISION_QA"]]) {
  await sql`INSERT INTO model_profiles(name,purpose,provider,model,secret_ref,enabled,config) VALUES(${name},${purpose}::model_purpose,${provider},${model},${secretRef},true,'{}') ON CONFLICT(name) DO UPDATE SET provider=excluded.provider,model=excluded.model,secret_ref=excluded.secret_ref,enabled=true,updated_at=now()`;
}
await sql.end();
console.log(`Development user, active Skill, and ${provider} model profiles are ready.`);
