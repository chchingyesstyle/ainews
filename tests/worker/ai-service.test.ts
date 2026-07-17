import { describe, expect, it, vi } from "vitest";

import { createDigest } from "../../src/ai/createDigest";
import { summarizeStory } from "../../src/ai/summarizeStory";

const storyOutput = {
  headline_zh_hk: "OpenAI 公布新的研究模型",
  summary_zh_hk: "OpenAI 表示，新模型在指定測試中提升了推理表現。",
  key_facts: ["模型已公布", "公司提供了測試結果", "完整技術細節仍待公開"],
  category: "模型與研究",
  named_entities: ["OpenAI"],
};

const aiInput = {
  modelId: "@cf/test/model",
  sourceName: "OpenAI",
  title: "OpenAI announces a new research model",
  publishedAt: "2026-07-17T05:00:00.000Z",
  excerpt: "The company described the model and published initial evaluation results.",
  canonicalUrl: "https://example.com/openai-model",
};

const digestInput = {
  modelId: "@cf/test/model",
  stories: [
    {
      id: 11,
      headline_zh_hk: storyOutput.headline_zh_hk,
      summary_zh_hk: storyOutput.summary_zh_hk,
      key_facts: storyOutput.key_facts,
      category: "模型與研究" as const,
    },
  ],
};

describe("summarizeStory", () => {
  it("sends bounded source fields and parses valid JSON", async () => {
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify(storyOutput) });
    const result = await summarizeStory({ run } as unknown as Ai, aiInput);

    expect(result).toEqual(storyOutput);
    expect(run).toHaveBeenCalledWith(
      "@cf/test/model",
      expect.objectContaining({
        response_format: { type: "json_object" },
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user", content: expect.stringContaining(aiInput.title) }),
        ]),
      }),
    );
  });

  it("accepts a structured JSON Mode response", async () => {
    const run = vi.fn().mockResolvedValue({ response: storyOutput });

    await expect(summarizeStory({ run } as unknown as Ai, aiInput)).resolves.toEqual(storyOutput);
  });

  it("rejects malformed model JSON", async () => {
    const run = vi.fn().mockResolvedValue({ response: "not json" });

    await expect(summarizeStory({ run } as unknown as Ai, aiInput)).rejects.toThrow(/JSON/);
  });

  it("propagates a rejected AI call", async () => {
    const run = vi.fn().mockRejectedValue(new Error("AI unavailable"));

    await expect(summarizeStory({ run } as unknown as Ai, aiInput)).rejects.toThrow("AI unavailable");
  });
});

describe("createDigest", () => {
  it("sends only validated story fields and validates the response", async () => {
    const digestOutput = {
      headline_zh_hk: "今日人工智能焦點",
      intro_zh_hk: "以下內容整理今日已核實來源的人工智能新聞。",
      sections: [
        {
          category: "模型與研究",
          summary_zh_hk: "研究機構公布模型進展。",
          story_ids: [11],
        },
      ],
    };
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify(digestOutput) });

    const result = await createDigest({ run } as unknown as Ai, digestInput);

    expect(result).toEqual(digestOutput);
    expect(run).toHaveBeenCalledWith(
      "@cf/test/model",
      expect.objectContaining({
        response_format: { type: "json_object" },
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user", content: expect.stringContaining("story_ids") }),
        ]),
      }),
    );
  });

  it("accepts a structured JSON Mode response", async () => {
    const digestOutput = {
      headline_zh_hk: "今日人工智能焦點",
      intro_zh_hk: "以下內容整理今日已核實來源的人工智能新聞。",
      sections: [
        {
          category: "模型與研究",
          summary_zh_hk: "研究機構公布模型進展。",
          story_ids: [11],
        },
      ],
    };
    const run = vi.fn().mockResolvedValue({ response: digestOutput });

    await expect(createDigest({ run } as unknown as Ai, digestInput)).resolves.toEqual(digestOutput);
  });
});
