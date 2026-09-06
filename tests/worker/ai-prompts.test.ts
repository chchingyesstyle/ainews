import { describe, expect, it } from "vitest";

import { DIGEST_SYSTEM_PROMPT } from "../../src/ai/prompts";

describe("DIGEST_SYSTEM_PROMPT", () => {
  it("specifies the required JSON fields, matching the shape STORY_SYSTEM_PROMPT already enumerates", () => {
    expect(DIGEST_SYSTEM_PROMPT).toContain("headline_zh_hk");
    expect(DIGEST_SYSTEM_PROMPT).toContain("intro_zh_hk");
    expect(DIGEST_SYSTEM_PROMPT).toContain("sections");
  });

  it("instructs each section summary to be a short, original sentence rather than a list of headlines", () => {
    expect(DIGEST_SYSTEM_PROMPT).toMatch(/一句話|簡短/);
    expect(DIGEST_SYSTEM_PROMPT).toMatch(/不可.*(標題|重複)|不可只.*羅列/);
  });
});
