import { AppError } from "./errors";

const SECRET_ENV_MAP = {
  OPENAI_PRIMARY: "OPENAI_API_KEY",
  OPENAI_SECONDARY: "OPENAI_SECONDARY_API_KEY",
  DEEPSEEK: "DEEPSEEK_API_KEY"
} as const;
export type SecretRef = keyof typeof SECRET_ENV_MAP | "MOCK";

export function resolveSecret(ref: string): string {
  if (ref === "MOCK") return "mock";
  if (!(ref in SECRET_ENV_MAP)) throw new AppError("MODEL_SECRET_MISSING", "模型密钥引用无效。", 500);
  const value = process.env[SECRET_ENV_MAP[ref as keyof typeof SECRET_ENV_MAP]];
  if (!value) throw new AppError("MODEL_SECRET_MISSING", "模型服务尚未由管理员配置。", 503);
  return value;
}

export function secretAvailability(ref: string): "configured" | "not configured" {
  if (ref === "MOCK") return "configured";
  if (!(ref in SECRET_ENV_MAP)) return "not configured";
  return process.env[SECRET_ENV_MAP[ref as keyof typeof SECRET_ENV_MAP]] ? "configured" : "not configured";
}
