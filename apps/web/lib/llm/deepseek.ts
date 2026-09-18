import OpenAI from "openai";
import { z } from "zod";
import { AppError } from "../errors";
import type { LLMProvider, StructuredRequest, StructuredResult, TextRequest, TextResult } from "./provider";

const DEFAULT_BASE_URL = "https://api.deepseek.com";

export class DeepSeekProvider implements LLMProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string, baseURL = process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = z.toJSONSchema(request.schema);
    const systemPrompt = [
      request.instructions,
      "必须只输出一个合法 JSON 对象，不得使用 Markdown 代码块或附加解释。",
      "输出必须严格满足以下 JSON Schema：",
      JSON.stringify(jsonSchema)
    ].join("\n\n");

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create({
          model: request.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: request.input }
          ],
          response_format: { type: "json_object" },
          reasoning_effort: "none",
          ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature })
        });
        const content = response.choices[0]?.message.content;
        if (!content) throw new Error("EMPTY_JSON_RESPONSE");
        const value = request.schema.parse(JSON.parse(content));
        return {
          value,
          ...(response.usage ? { usage: response.usage as unknown as Record<string, unknown> } : {}),
          responseId: response.id
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw new AppError(
      "MODEL_SCHEMA_INVALID",
      "DeepSeek 未返回符合业务结构的结果，请稍后重试。",
      502
    );
  }

  async generateText(request: TextRequest): Promise<TextResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        messages: [
          { role: "system", content: request.instructions },
          { role: "user", content: request.input }
        ],
        reasoning_effort: "none",
        ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens })
      });
      const text = response.choices[0]?.message.content;
      if (!text) throw new Error("EMPTY_TEXT_RESPONSE");
      return {
        text,
        ...(response.usage ? { usage: response.usage as unknown as Record<string, unknown> } : {}),
        responseId: response.id
      };
    } catch (error) {
      throw new AppError(
        "MODEL_TIMEOUT",
        "DeepSeek 模型服务调用失败。",
        502
      );
    }
  }

  supportsVision(): boolean {
    return false;
  }
}
