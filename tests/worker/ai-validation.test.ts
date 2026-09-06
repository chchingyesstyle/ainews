import { describe, expect, it } from "vitest";

import { validateDigestOutput, validateStoryOutput } from "../../src/ai/validateOutput";

const validStory = {
  headline_zh_hk: "OpenAI 公布新的研究模型",
  summary_zh_hk: "OpenAI 表示，新模型在指定測試中提升了推理表現，但公司未公布完整技術細節。",
  key_facts: ["模型已公布", "公司提供了測試結果", "完整技術細節仍待公開"],
  category: "模型與研究",
  named_entities: ["OpenAI"],
};

const validDigest = {
  headline_zh_hk: "今日人工智能焦點",
  intro_zh_hk: "以下內容整理今日已核實來源的人工智能新聞，詳情請參閱各篇原文。",
  sections: [
    {
      category: "模型與研究",
      summary_zh_hk: "研究機構公布模型進展。",
      story_ids: [11],
    },
  ],
};

describe("validateStoryOutput", () => {
  it("accepts a valid story contract and trims strings", () => {
    const output = validateStoryOutput({
      ...validStory,
      headline_zh_hk: ` ${validStory.headline_zh_hk} `,
    });

    expect(output.headline_zh_hk).toBe(validStory.headline_zh_hk);
    expect(output.key_facts).toHaveLength(3);
  });

  it("rejects a missing headline", () => {
    const value = { ...validStory, headline_zh_hk: "" };
    expect(() => validateStoryOutput(value)).toThrow(/headline_zh_hk/);
  });

  it("rejects non-array key facts", () => {
    const value = { ...validStory, key_facts: "not an array" };
    expect(() => validateStoryOutput(value)).toThrow(/key_facts/);
  });

  it("rejects an unknown category", () => {
    const value = { ...validStory, category: "人工智能雜談" };
    expect(() => validateStoryOutput(value)).toThrow(/category/);
  });

  it("rejects overlong generated fields", () => {
    const value = { ...validStory, headline_zh_hk: "字".repeat(201) };
    expect(() => validateStoryOutput(value)).toThrow(/headline_zh_hk/);
  });

  it("rejects generated HTML tags", () => {
    const value = { ...validStory, summary_zh_hk: "<script>alert(1)</script>" };
    expect(() => validateStoryOutput(value)).toThrow(/HTML/);
  });
});

describe("validateDigestOutput", () => {
  it("accepts digest story IDs from the allowed set", () => {
    const output = validateDigestOutput(validDigest, [11, 12]);

    expect(output.sections[0]?.story_ids).toEqual([11]);
  });

  it("rejects a story ID outside the allowed set", () => {
    const value = {
      ...validDigest,
      sections: [{ ...validDigest.sections[0], story_ids: [99] }],
    };

    expect(() => validateDigestOutput(value, [11, 12])).toThrow(/story_ids/);
  });

  it("rejects duplicate story IDs across sections", () => {
    const value = {
      ...validDigest,
      sections: [
        validDigest.sections[0],
        { category: "產品與公司", summary_zh_hk: "另一項消息。", story_ids: [11] },
      ],
    };

    expect(() => validateDigestOutput(value, [11, 12])).toThrow(/duplicate/);
  });

  it("rejects a section summary long enough to break the section-heading layout", () => {
    const value = {
      ...validDigest,
      sections: [{ ...validDigest.sections[0], summary_zh_hk: "字".repeat(201) }],
    };

    expect(() => validateDigestOutput(value, [11, 12])).toThrow(/summary_zh_hk/);
  });
});
