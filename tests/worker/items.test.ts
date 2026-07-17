import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { getRecentNewItems } from "../../src/db/repositories/items";
import { createSource } from "../../src/db/repositories/sources";

describe("ingested item reads", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ingested_items"),
      env.DB.prepare("DELETE FROM sources"),
    ]);
  });

  it("bounds recent candidates to protect the Worker query payload", async () => {
    const sourceId = await createSource(env.DB, {
      name: "Example AI",
      publisherUrl: "https://example.com",
      feedUrl: "https://example.com/feed.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });

    await env.DB.batch(
      Array.from({ length: 210 }, (_, index) =>
        env.DB
          .prepare(
            `INSERT INTO ingested_items
              (source_id, guid, canonical_url, title, source_excerpt, published_at, discovered_at, title_hash, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
          )
          .bind(
            sourceId,
            String(index),
            `https://example.com/story-${index}`,
            `AI item ${index}`,
            "Excerpt",
            "2026-07-17T05:00:00.000Z",
            "2026-07-17T05:00:00.000Z",
            `title-${index}`,
          ),
      ),
    );

    const items = await getRecentNewItems(env.DB, "2026-07-16T00:00:00.000Z");

    expect(items).toHaveLength(200);
    expect(items[0]?.title).toBe("AI item 209");
  });
});
