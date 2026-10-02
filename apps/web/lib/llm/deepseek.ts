import OpenAI from "openai";
import { z } from "zod";
import { AppError } from "../errors";
import type { LLMProvider, StructuredRequest, StructuredResult, TextRequest, TextResult } from "./provider";

const DEFAULT_BASE_URL = "https://api.deepseek.com";

function describeError(error: unknown): string {
  if (error instanceof z.ZodError) return `SCHEMA_MISMATCH ${describeIssues(error)}`;
  if (error instanceof Error) return error.message.slice(0, 200);
  return String(error).slice(0, 200);
}

/** Turns a Zod error into a short, model-readable list of the offending paths. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

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

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: request.input }
    ];

    let lastReason = "unknown";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create({
          model: request.model,
          messages,
          response_format: { type: "json_object" },
          reasoning_effort: "none",
          ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature })
        });
        const choice = response.choices[0];
        const content = choice?.message.content;
        if (!content) throw new Error("EMPTY_JSON_RESPONSE");
        // A truncated answer cannot parse, and used to be reported as a vague
        // schema failure; name it so the output budget can be raised instead.
        if (choice?.finish_reason === "length") throw new Error("OUTPUT_TRUNCATED");
        const parsed = request.schema.safeParse(JSON.parse(content));
        if (!parsed.success) throw parsed.error;
        return {
          value: parsed.data,
          ...(response.usage ? { usage: response.usage as unknown as Record<string, unknown> } : {}),
          responseId: response.id
        };
      } catch (error) {
        lastReason = describeError(error);
        console.error(`structured_output_rejected model=${request.model} schema=${request.schemaName} attempt=${attempt + 1} reason=${lastReason}`);
        // Feeding the rejection back beats repeating the same request verbatim,
        // which tends to reproduce the same mistake.
        messages.push({ role: "user", content: `上一次输出未被接受：${lastReason}。请修正该问题后重新输出完整 JSON。` });
      }
    }
    throw new AppError("MODEL_SCHEMA_INVALID", `模型未返回符合业务结构的结果：${lastReason}`, 502);
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
