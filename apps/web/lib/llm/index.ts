import type { LLMProvider } from "./provider";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { DeepSeekProvider } from "./deepseek";
import { resolveSecret } from "../secrets";

export function createProvider(provider: string, secretRef: string, fixtures?: Record<string, unknown>): LLMProvider {
  if (provider === "mock") return new MockProvider(fixtures);
  if (provider === "openai") return new OpenAIProvider(resolveSecret(secretRef));
  if (provider === "deepseek") return new DeepSeekProvider(resolveSecret(secretRef));
  throw new Error(`Unsupported model provider: ${provider}`);
}
export type * from "./provider";
