
import type { DigestAiOutput, DigestStoryInput } from "./contracts";
import { buildDigestPrompt, DIGEST_SYSTEM_PROMPT } from "./prompts";
import { validateDigestOutput } from "./validateOutput";

export interface DigestInput {
  modelId: string;
  stories: DigestStoryInput[];
}

function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object" && "response" in value) {
    const response = (value as { response?: unknown }).response;
    if (typeof response === "string") return response;
  }
  throw new Error("Workers AI returned no digest response");
}

function parseJsonResponse(value: unknown): unknown {
  try {
    return JSON.parse(responseText(value).trim()) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Workers AI returned invalid digest JSON");
    throw error;
  }
}

export async function createDigest(ai: Ai, input: DigestInput): Promise<DigestAiOutput> {
  const allowedStoryIds = input.stories.map((story) => story.id);
  const result = await ai.run(input.modelId, {
    messages: [
      { role: "system", content: DIGEST_SYSTEM_PROMPT },
      { role: "user", content: buildDigestPrompt(input.stories) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 900,
  });

  return validateDigestOutput(parseJsonResponse(result), allowedStoryIds);
}
