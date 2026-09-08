
import type { StoryAiOutput } from "./contracts";
import { buildStoryPrompt, STORY_SYSTEM_PROMPT } from "./prompts";
import { validateStoryOutput } from "./validateOutput";

export interface StorySummaryInput {
  modelId: string;
  sourceName: string;
  title: string;
  publishedAt: string | null;
  excerpt: string | null;
  canonicalUrl: string;
}

const MAX_OUTPUT_ATTEMPTS = 2;
const OUTPUT_RETRY_INSTRUCTION = "上一次輸出未符合指定 JSON schema。請重新檢查所有欄位，只輸出完整 JSON；key_facts 必須正好三項，named_entities 必須是陣列。";

function parseJsonResponse(value: unknown): unknown {
  let payload = value;
  if (value !== null && typeof value === "object" && "response" in value) {
    payload = (value as { response?: unknown }).response;
  }
  if (payload !== null && typeof payload === "object") return payload;
  if (typeof payload !== "string") throw new Error("Workers AI returned no text response");
  try {
    return JSON.parse(payload.trim()) as unknown;
  } catch {
    throw new Error("Workers AI returned invalid JSON");
  }
}

export async function summarizeStory(ai: Ai, input: StorySummaryInput): Promise<StoryAiOutput> {
  const prompt = buildStoryPrompt(input);
  let lastOutputError: unknown = null;

  for (let attempt = 0; attempt < MAX_OUTPUT_ATTEMPTS; attempt += 1) {
    // Retry only malformed model output. Transport or provider errors still fail fast.
    const result = await ai.run(input.modelId, {
      messages: [
        { role: "system", content: STORY_SYSTEM_PROMPT },
        {
          role: "user",
          content: attempt === 0 ? prompt : `${prompt}\n\n${OUTPUT_RETRY_INSTRUCTION}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 700,
    });

    try {
      return validateStoryOutput(parseJsonResponse(result));
    } catch (error) {
      lastOutputError = error;
      if (attempt === MAX_OUTPUT_ATTEMPTS - 1) throw error;
    }
  }

  throw lastOutputError instanceof Error ? lastOutputError : new Error("Workers AI returned invalid story output");
}
