// Workers AI models return either the legacy shape ({ response: string | object })
// or an OpenAI-style chat completion ({ choices: [{ message: { content } }] }).
// Both shapes must stay supported so model swaps do not silently break parsing.

// Request options shared by every JSON-producing call. Reasoning models otherwise
// spend the whole max_tokens budget on hidden thinking and return empty content.
export const DISABLE_REASONING = { chat_template_kwargs: { enable_thinking: false } } as const;

function chatCompletionContent(value: object): unknown {
  if (!("choices" in value) || !Array.isArray(value.choices)) return undefined;
  const choice: unknown = value.choices[0];
  if (choice === null || typeof choice !== "object") return undefined;
  const message = "message" in choice ? choice.message : undefined;
  const content = message !== null && typeof message === "object" && "content" in message
    ? message.content
    : undefined;
  const finishReason = "finish_reason" in choice ? choice.finish_reason : undefined;
  if ((content === undefined || content === null || content === "") && finishReason === "length") {
    throw new Error("Workers AI output was truncated before any answer content");
  }
  return content;
}

export function parseJsonResponse(
  value: unknown,
  messages: { empty: string; invalid: string },
): unknown {
  let payload = value;
  if (value !== null && typeof value === "object") {
    if ("response" in value) {
      payload = value.response;
    } else if ("choices" in value) {
      payload = chatCompletionContent(value);
    }
  }
  if (payload !== null && typeof payload === "object") return payload;
  if (typeof payload !== "string" || payload.trim() === "") throw new Error(messages.empty);
  try {
    return JSON.parse(payload.trim()) as unknown;
  } catch {
    throw new Error(messages.invalid);
  }
}
