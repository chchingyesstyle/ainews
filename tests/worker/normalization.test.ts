import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../../src/feeds/normalizeUrl";
import { titleFingerprint } from "../../src/feeds/titleFingerprint";

describe("normalizeUrl", () => {
  it("removes tracking parameters, fragments, host casing, and trailing slashes", () => {
    expect(
      normalizeUrl("HTTPS://Example.COM/story/?utm_source=rss&b=2&a=1#section"),
    ).toBe("https://example.com/story?a=1&b=2");
  });

  it("returns an empty string for an invalid URL", () => {
    expect(normalizeUrl("not a url")).toBe("");
  });
});

describe("titleFingerprint", () => {
  it("normalizes English case and Chinese punctuation", () => {
    expect(titleFingerprint("  AI：New Model!  ")).toBe("ai new model");
    expect(titleFingerprint("新模型：今天發布")).toBe("新模型 今天發布");
  });
});
