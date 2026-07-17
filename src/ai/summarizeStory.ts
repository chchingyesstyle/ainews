
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

function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object" && "response" in value) {
    const response = (value as { response?: unknown }).response;
    if (typeof response === "string") return response;
  }
  throw new Error("Workers AI returned no text response");
}

function parseJsonResponse(value: unknown): unknown {
  const text = responseText(value).trim();
  try {
    return JSON.parse(text) as unknown;
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
