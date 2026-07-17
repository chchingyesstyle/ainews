
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
  const result = await ai.run(input.modelId, {
    messages: [
      { role: "system", content: STORY_SYSTEM_PROMPT },
      { role: "user", content: buildStoryPrompt(input) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 700,
  });

  return validateStoryOutput(parseJsonResponse(result));
}
