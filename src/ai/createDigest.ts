
import type { DigestAiOutput, DigestStoryInput } from "./contracts";
import { buildDigestPrompt, DIGEST_SYSTEM_PROMPT } from "./prompts";
import { DISABLE_REASONING, parseJsonResponse } from "./parseResponse";
import { validateDigestOutput } from "./validateOutput";

export interface DigestInput {
  modelId: string;
  stories: DigestStoryInput[];
}

const RESPONSE_ERRORS = {
  empty: "Workers AI returned no digest response",
  invalid: "Workers AI returned invalid digest JSON",
};

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
    ...DISABLE_REASONING,
  });

  const output = validateDigestOutput(parseJsonResponse(result, RESPONSE_ERRORS), allowedStoryIds);
  const categories = new Map(input.stories.map((story) => [story.id, story.category]));
  for (const section of output.sections) {
    if (section.story_ids.some((id) => categories.get(id) !== section.category)) {
      throw new Error("Digest section category does not match its stories");
    }
  }
  const includedStoryIds = new Set(output.sections.flatMap((section) => section.story_ids));
  if (includedStoryIds.size !== new Set(allowedStoryIds).size || allowedStoryIds.some((id) => !includedStoryIds.has(id))) {
    throw new Error("Digest output omitted one or more story IDs");
  }
  return output;
}
