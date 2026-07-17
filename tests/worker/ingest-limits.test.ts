import { describe, expect, it } from "vitest";

import { limitItemsForIngestion } from "../../src/pipeline/runDailyPipeline";
import type { FeedItem } from "../../src/feeds/types";

describe("pipeline ingestion limits", () => {
  it("keeps only the newest bounded set of discovered items", () => {
    const items: FeedItem[] = Array.from({ length: 205 }, (_, index) => ({
      sourceId: index % 3,
      canonicalUrl: `https://example.com/story-${index}`,
      guid: String(index),
      title: `AI story ${index}`,
      excerpt: "Excerpt",
      publishedAt: new Date(Date.UTC(2026, 6, 17, 0, index)).toISOString(),
      titleHash: `story-${index}`,
    }));

    const limited = limitItemsForIngestion(items);

    expect(limited).toHaveLength(200);
    expect(limited[0]?.canonicalUrl).toBe("https://example.com/story-204");
    expect(limited.at(-1)?.canonicalUrl).toBe("https://example.com/story-5");
  });
});
