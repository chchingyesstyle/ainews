import { describe, expect, it, vi } from "vitest";
import type { SourceRecord } from "../../src/db/types";
import { collectFromFeeds, collectFromGdelt } from "../../src/feeds/collectFeeds";

const source = (id: number, feedUrl: string): SourceRecord => ({
  id,
  name: "Source " + id,
  publisher_url: "https://example.com",
  feed_url: feedUrl,
  default_category: "模型與研究",
  language: "en",
  enabled: 1,
  last_fetched_at: null,
  failure_count: 0,
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:00:00.000Z",
});

const feedXml = (url: string) =>
  "<rss><channel><item><guid>1</guid><title>AI update</title><link>" +
  url +
  "</link></item></channel></rss>";

describe("collectFromFeeds", () => {
  it("continues after a failed feed and returns successful items", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("bad.xml")) throw new Error("connection refused");
      return new Response(feedXml("https://example.com/story"));
    });

    const result = await collectFromFeeds(
      [source(1, "https://example.com/good.xml"), source(2, "https://example.com/bad.xml")],
      fetcher,
    );

    expect(result.feedsAttempted).toBe(2);
    expect(result.feedsSucceeded).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.errors).toEqual(["Source 2: connection refused"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("collectFromGdelt", () => {
  it("requests a 24-hour RSS article list and parses the result", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("api.gdeltproject.org/api/v2/doc/doc");
      expect(url).toContain("timespan=24h");
      expect(url).toContain("mode=artlist");
      expect(url).toContain("format=rss");
      return new Response(feedXml("https://example.com/gdelt-story"));
    });

    const result = await collectFromGdelt("artificial intelligence", fetcher);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      canonicalUrl: "https://example.com/gdelt-story",
      title: "AI update",
    });
  });
});
