import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { LLMProvider, StructuredRequest, StructuredResult, TextRequest, TextResult } from "./provider";
import { AppError } from "../errors";

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  constructor(apiKey: string) { this.client = new OpenAI({ apiKey }); }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    try {
      const response = await this.client.responses.parse({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        text: { format: zodTextFormat(request.schema, request.schemaName) },
        ...(request.maxOutputTokens === undefined ? {} : { max_output_tokens: request.maxOutputTokens }),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
        store: false
      });
      if (!response.output_parsed) throw new AppError("MODEL_SCHEMA_INVALID", "模型未返回有效的结构化结果。", 502);
      return {
        value: response.output_parsed as T,
        ...(response.usage ? { usage: response.usage as unknown as Record<string, unknown> } : {}),
        responseId: response.id
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("MODEL_TIMEOUT", "模型服务调用失败。", 502);
    }
  }

  async generateText(request: TextRequest): Promise<TextResult> {
    const response = await this.client.responses.create({
      model: request.model,
      instructions: request.instructions,
      input: request.input,
      ...(request.maxOutputTokens === undefined ? {} : { max_output_tokens: request.maxOutputTokens }),
      store: false
    });
    return {
      text: response.output_text,
      ...(response.usage ? { usage: response.usage as unknown as Record<string, unknown> } : {}),
      responseId: response.id
    };
  }
  supportsVision(): boolean { return true; }
}
