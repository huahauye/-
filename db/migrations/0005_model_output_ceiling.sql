-- Correct the output budget: 8192 was too low.
--
-- Measured against the configured model: with no max_tokens a single answer
-- reached 12,752 completion tokens and stopped naturally, while max_tokens=8192
-- stopped mid-JSON with finish_reason=length. 0004 introduced that truncation
-- for long steps (a full amendment plan or statement), so the ceiling is raised
-- well above any observed need: it still bounds a runaway generation, but it no
-- longer cuts a legitimate answer in half.

UPDATE model_profiles
SET config = coalesce(config, '{}'::jsonb) || jsonb_build_object('maxOutputTokens', 32768),
    updated_at = now()
WHERE purpose IN ('ANALYSIS', 'DRAFTING', 'QA', 'CLASSIFICATION')
  AND coalesce((config->>'maxOutputTokens')::int, 0) < 32768;
