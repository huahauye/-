import type { z } from "zod";

export interface StructuredRequest<T> {
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
  metadata?: Record<string, string>;
}
export interface StructuredResult<T> { value: T; usage?: Record<string, unknown>; responseId?: string; }
export interface TextRequest { model: string; instructions: string; input: string; maxOutputTokens?: number; }
export interface TextResult { text: string; usage?: Record<string, unknown>; responseId?: string; }

export interface LLMProvider {
  generateStructured<T>(input: StructuredRequest<T>): Promise<StructuredResult<T>>;
  generateText(input: TextRequest): Promise<TextResult>;
  supportsVision(): boolean;
}
