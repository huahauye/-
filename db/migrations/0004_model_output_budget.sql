-- Give the long-output steps an explicit token budget.
--
-- The seeded profiles carried `config = '{}'`, so no `max_tokens` was sent and
-- the provider's default applied. A full statement or QA report can exceed that,
-- and an answer cut off mid-JSON surfaces as an opaque "structure" failure.
-- Raising the ceiling costs nothing on its own: tokens are billed as generated.
--
-- This is a one-time floor for deployments that already ran 0002; the value can
-- be changed later from /admin.

UPDATE model_profiles
SET config = coalesce(config, '{}'::jsonb) || jsonb_build_object('maxOutputTokens', 8192),
    updated_at = now()
WHERE purpose IN ('DRAFTING', 'QA')
  AND (config->>'maxOutputTokens') IS NULL;

UPDATE model_profiles
SET config = coalesce(config, '{}'::jsonb) || jsonb_build_object('maxOutputTokens', 8192),
    updated_at = now()
WHERE purpose IN ('ANALYSIS', 'CLASSIFICATION')
  AND (config->>'maxOutputTokens') IS NULL;
