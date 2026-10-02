-- Baseline reference data for a fresh deployment.
--
-- Seeds the active OA-response Skill version and the DeepSeek model profiles that
-- the fixed workflow resolves through run_model_snapshots. It touches no case,
-- document or run data and is safe to re-apply on every deploy.
--
-- The seeded bundle key/checksum is a bootstrap placeholder: the 16-step
-- workflow keeps its prompts in reviewed repository code, so runs do not fetch
-- this object. Import the real Skill ZIP from /admin when you want provenance
-- to point at an uploaded bundle.

INSERT INTO skills(slug, name)
VALUES ('cn-patent-oa-response', '涓浗鍙戞槑涓撳埄 OA 鎰忚闄堣堪涔︾敓鎴?)
ON CONFLICT(slug) DO UPDATE SET name = excluded.name;

-- skill_versions_one_active_uq allows a single active version per Skill.
UPDATE skill_versions
SET is_active = false, status = 'ARCHIVED'
WHERE skill_id = (SELECT id FROM skills WHERE slug = 'cn-patent-oa-response')
  AND is_active = true
  AND version <> '1.0.0';

INSERT INTO skill_versions(
  skill_id, version, status, is_active, bundle_key, bundle_sha256,
  runtime_manifest, created_by, published_at
) VALUES (
  (SELECT id FROM skills WHERE slug = 'cn-patent-oa-response'),
  '1.0.0', 'PUBLISHED', true,
  'skills/seed/cn-patent-oa-response.zip', 'production-seed-v1',
  '{"schemaVersion":"1.0","root":"SKILL.md","steps":{"evidence":["references/evidence-workflow.md"],"analysis":["references/novelty-inventive-step.md"],"drafting":["references/drafting-and-qa.md"],"docx":["references/docx-output.md"]}}'::jsonb,
  NULL, now()
)
ON CONFLICT(skill_id, version) DO UPDATE SET
  status = 'PUBLISHED', is_active = true, published_at = now();

INSERT INTO model_profiles(name, purpose, provider, model, secret_ref, enabled, config)
VALUES
  ('analysis-primary', 'ANALYSIS', 'deepseek', 'deepseek-flash', 'DEEPSEEK', true, '{"maxOutputTokens": 8192}'::jsonb),
  ('drafting-primary', 'DRAFTING', 'deepseek', 'deepseek-flash', 'DEEPSEEK', true, '{"maxOutputTokens": 8192}'::jsonb),
  ('qa-primary', 'QA', 'deepseek', 'deepseek-flash', 'DEEPSEEK', true, '{"maxOutputTokens": 8192}'::jsonb),
  ('classification-primary', 'CLASSIFICATION', 'deepseek', 'deepseek-flash', 'DEEPSEEK', true, '{"maxOutputTokens": 8192}'::jsonb),
  ('vision-qa-primary', 'VISION_QA', 'deepseek', 'deepseek-flash', 'DEEPSEEK', true, '{"maxOutputTokens": 8192}'::jsonb)
ON CONFLICT(name) DO UPDATE SET
  provider = excluded.provider,
  model = excluded.model,
  secret_ref = excluded.secret_ref,
  enabled = true,
  updated_at = now();
