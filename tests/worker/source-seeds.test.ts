import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("curated feed seeds", () => {
  it("provides free AI news sources for the scheduled pipeline", async () => {
    const result = await env.DB
      .prepare(
        "SELECT name, feed_url, enabled FROM sources WHERE enabled = 1 ORDER BY id",
      )
      .all<{ name: string; feed_url: string; enabled: number }>();

    expect(result.results.length).toBeGreaterThanOrEqual(8);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Google AI",
          feed_url: "https://blog.google/technology/ai/rss/",
          enabled: 1,
        }),
        expect.objectContaining({
          name: "Hugging Face Blog",
          feed_url: "https://huggingface.co/blog/feed.xml",
          enabled: 1,
        }),
        expect.objectContaining({
          name: "arXiv cs.AI",
          feed_url: "https://export.arxiv.org/rss/cs.AI",
          enabled: 1,
        }),
      ]),
    );
  });
});
