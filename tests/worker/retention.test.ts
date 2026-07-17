import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { pruneExpiredUnreferencedItems } from "../../src/db/repositories/items";
import { createSource } from "../../src/db/repositories/sources";
import { createStory } from "../../src/db/repositories/stories";

const CUTOFF = "2026-04-18T06:00:00.000Z";

async function insertItem(
  sourceId: number,
  key: string,
  discoveredAt: string,
  status: "new" | "selected" | "published" | "rejected" | "failed",
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO ingested_items
      (source_id, guid, canonical_url, title, source_excerpt, published_at, discovered_at, title_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    sourceId,
    key,
    `https://example.com/${key}`,
    `Story ${key}`,
    "Excerpt",
    discoveredAt,
    discoveredAt,
    `hash-${key}`,
    status,
  ).run();
  return Number(result.meta.last_row_id);
}

describe("ingested item retention", () => {
  let sourceId: number;

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM digest_stories"),
      env.DB.prepare("DELETE FROM pipeline_runs"),
      env.DB.prepare("DELETE FROM digests"),
      env.DB.prepare("DELETE FROM stories"),
      env.DB.prepare("DELETE FROM ingested_items"),
      env.DB.prepare("DELETE FROM sources"),
    ]);
    sourceId = await createSource(env.DB, {
      name: "Example AI",
      publisherUrl: "https://example.com",
      feedUrl: "https://example.com/feed.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
  });

  it("deletes only stale unreferenced non-published rows", async () => {
    const eligibleId = await insertItem(sourceId, "eligible", "2026-04-01T00:00:00.000Z", "failed");
    const boundaryId = await insertItem(sourceId, "boundary", CUTOFF, "failed");
    const recentId = await insertItem(sourceId, "recent", "2026-04-19T00:00:00.000Z", "new");
    const publishedId = await insertItem(sourceId, "published", "2026-03-01T00:00:00.000Z", "published");
    const linkedId = await insertItem(sourceId, "linked", "2026-03-02T00:00:00.000Z", "failed");
    await createStory(env.DB, {
      ingestedItemId: linkedId,
      slug: "linked-story",
      headlineZhHk: "已發佈文章",
      summaryZhHk: "這是已驗證的文章摘要。",
      keyFacts: ["事實一", "事實二", "事實三"],
      category: "模型與研究",
      namedEntities: [],
      sourceName: "Example AI",
      sourceUrl: "https://example.com/linked",
      sourcePublishedAt: "2026-03-02T00:00:00.000Z",
      publishedAt: "2026-03-02T01:00:00.000Z",
      status: "published",
      modelId: "@cf/test/model",
      promptVersion: "test-v1",
    });

    await expect(pruneExpiredUnreferencedItems(env.DB, CUTOFF)).resolves.toBe(1);
    const rows = await env.DB.prepare("SELECT id FROM ingested_items ORDER BY id").all<{ id: number }>();
    expect(rows.results.map((row) => row.id)).toEqual(
      [boundaryId, recentId, publishedId, linkedId].sort((left, right) => left - right),
    );
    expect(rows.results.some((row) => row.id === eligibleId)).toBe(false);
  });

  it("deletes only the oldest rows up to the supplied limit", async () => {
    const oldestId = await insertItem(sourceId, "oldest", "2026-01-01T00:00:00.000Z", "failed");
    const middleId = await insertItem(sourceId, "middle", "2026-02-01T00:00:00.000Z", "rejected");
    const newestId = await insertItem(sourceId, "newest", "2026-03-01T00:00:00.000Z", "selected");

    await expect(pruneExpiredUnreferencedItems(env.DB, CUTOFF, 2)).resolves.toBe(2);
    const rows = await env.DB.prepare("SELECT id FROM ingested_items ORDER BY id").all<{ id: number }>();
    expect(rows.results.map((row) => row.id)).toEqual([newestId]);
    expect(rows.results.some((row) => row.id === oldestId || row.id === middleId)).toBe(false);
  });

  it("caps each cleanup at 500 rows", async () => {
    await env.DB.batch(
      Array.from({ length: 501 }, (_, index) =>
        env.DB.prepare(
          `INSERT INTO ingested_items
            (source_id, guid, canonical_url, title, source_excerpt, published_at, discovered_at, title_hash, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed')`,
        ).bind(
          sourceId,
          `bulk-${index}`,
          `https://example.com/bulk-${index}`,
          `Bulk story ${index}`,
          "Excerpt",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z",
          `bulk-hash-${index}`,
        ),
      ),
    );

    await expect(pruneExpiredUnreferencedItems(env.DB, CUTOFF, 999)).resolves.toBe(500);
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM ingested_items").first<{ count: number }>())
      .resolves.toMatchObject({ count: 1 });
  });
});
