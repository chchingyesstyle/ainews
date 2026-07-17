import { describe, expect, it } from "vitest";
import { parseFeed } from "../../src/feeds/parseFeed";
import type { SourceRecord } from "../../src/db/types";

const source: SourceRecord = {
  id: 7,
  name: "Example AI",
  publisher_url: "https://example.com",
  feed_url: "https://example.com/rss.xml",
  default_category: "模型與研究",
  language: "en",
  enabled: 1,
  last_fetched_at: null,
  failure_count: 0,
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:00:00.000Z",
};

describe("parseFeed", () => {
  it("parses RSS titles, links, descriptions, dates, and CDATA", () => {
    const xml = [
      "<?xml version=\"1.0\"?>",
      "<rss version=\"2.0\"><channel>",
      "<item><guid>story-1</guid><title>AI &amp; Safety</title>",
      "<link>https://example.com/story-1</link>",
      "<description><![CDATA[Short description]]></description>",
      "<pubDate>Fri, 17 Jul 2026 08:00:00 GMT</pubDate></item>",
      "</channel></rss>",
    ].join("");

    expect(parseFeed(xml, source)).toEqual([
      {
        sourceId: 7,
        guid: "story-1",
        canonicalUrl: "https://example.com/story-1",
        title: "AI & Safety",
        excerpt: "Short description",
        publishedAt: "2026-07-17T08:00:00.000Z",
        titleHash: "ai safety",
      },
    ]);
  });

  it("parses Atom alternate links and tolerates a missing summary", () => {
    const xml = [
      "<?xml version=\"1.0\"?>",
      "<feed xmlns=\"http://www.w3.org/2005/Atom\">",
      "<entry><id>tag:example.com,2026:2</id><title>Model release</title>",
      "<link rel=\"alternate\" href=\"https://example.com/model\"/>",
      "<updated>2026-07-17T09:00:00Z</updated></entry>",
      "</feed>",
    ].join("");

    expect(parseFeed(xml, source)).toEqual([
      expect.objectContaining({
        sourceId: 7,
        guid: "tag:example.com,2026:2",
        canonicalUrl: "https://example.com/model",
        title: "Model release",
        excerpt: null,
        publishedAt: "2026-07-17T09:00:00.000Z",
      }),
    ]);
  });

  it("ignores entries without a usable title or URL", () => {
    const xml = "<rss><channel><item><title>Missing link</title></item><item><link>https://example.com/2</link></item></channel></rss>";
    expect(parseFeed(xml, source)).toEqual([]);
  });
});
