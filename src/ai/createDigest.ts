
import type { DigestAiOutput, DigestStoryInput } from "./contracts";
import { buildDigestPrompt, DIGEST_SYSTEM_PROMPT } from "./prompts";
import { validateDigestOutput } from "./validateOutput";

export interface DigestInput {
  modelId: string;
  stories: DigestStoryInput[];
}

function parseJsonResponse(value: unknown): unknown {
  let payload = value;
  if (value !== null && typeof value === "object" && "response" in value) {
    payload = (value as { response?: unknown }).response;
  }
  if (payload !== null && typeof payload === "object") return payload;
  if (typeof payload !== "string") throw new Error("Workers AI returned no digest response");
  try {
    return JSON.parse(payload.trim()) as unknown;
  } catch {
    throw new Error("Workers AI returned invalid digest JSON");
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
