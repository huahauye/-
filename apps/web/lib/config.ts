import { z } from "zod";

const serverConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_MODE: z.enum(["netlify", "mock"]).default("netlify"),
  WORKFLOW_DRIVER: z.enum(["netlify", "inline"]).default("netlify"),
  DATABASE_URL: z.string().optional(),
  NETLIFY_DB_URL: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(200),
  ALLOW_GENERATE_WITH_MISSING_PRIOR_ART: z.enum(["true", "false"]).default("false"),
  ACTIVE_SKILL_SLUG: z.string().default("cn-patent-oa-response"),
  BOOTSTRAP_FIRST_ADMIN: z.enum(["true", "false"]).default("false"),
  PARSER_VERSION: z.string().default("1.0.0"),
  BUILDER_VERSION: z.string().default("1.0.0"),
  APP_GIT_SHA: z.string().default("local"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  MOCK_USER_ID: z.string().uuid().default("00000000-0000-4000-8000-000000000001"),
  MOCK_USER_EMAIL: z.string().email().default("dev@example.invalid")
});

let cached: z.infer<typeof serverConfigSchema> | undefined;
export function serverConfig() {
  if (!cached) {
    cached = serverConfigSchema.parse({
      ...process.env,
      S3_ENDPOINT: process.env.R2_ENDPOINT ?? process.env.S3_ENDPOINT,
      S3_BUCKET: process.env.R2_BUCKET ?? process.env.S3_BUCKET,
      S3_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY
    });
    if (cached.NODE_ENV === "production" && (cached.AUTH_MODE === "mock" || process.env.LLM_PROVIDER === "mock")) {
      throw new Error("Production cannot start with mock authentication or model provider.");
    }
  }
  return cached;
}

export function databaseUrl(): string {
  const config = serverConfig();
  const url = config.NETLIFY_DB_URL ?? config.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or NETLIFY_DB_URL is required");
  return url;
}

const storageConfigSchema = serverConfigSchema.pick({
  S3_ENDPOINT: true,
  S3_REGION: true,
  S3_BUCKET: true,
  S3_ACCESS_KEY_ID: true,
  S3_SECRET_ACCESS_KEY: true,
  S3_FORCE_PATH_STYLE: true
}).required({
  S3_ENDPOINT: true,
  S3_BUCKET: true,
  S3_ACCESS_KEY_ID: true,
  S3_SECRET_ACCESS_KEY: true
});

export function storageConfig() {
  return storageConfigSchema.parse(serverConfig());
}
