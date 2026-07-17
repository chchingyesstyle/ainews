import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import worker from "../../src/index";
import { upsertIngestedItem } from "../../src/db/repositories/items";
import { replaceDigestStories, upsertDigest } from "../../src/db/repositories/digests";
import { createSource } from "../../src/db/repositories/sources";
import { createStory } from "../../src/db/repositories/stories";

async function clearDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM digest_stories"),
    env.DB.prepare("DELETE FROM digests"),
    env.DB.prepare("DELETE FROM stories"),
    env.DB.prepare("DELETE FROM ingested_items"),
    env.DB.prepare("DELETE FROM sources"),
  ]);
}

async function seedStory(): Promise<number> {
  const sourceId = await createSource(env.DB, {
    name: "來源 & 測試社",
    publisherUrl: "https://publisher.example",
    feedUrl: "https://publisher.example/rss.xml",
    defaultCategory: "產品與公司",
    language: "en",
  });
  const item = await upsertIngestedItem(env.DB, {
    sourceId,
    guid: "feed-1",
    canonicalUrl: "https://publisher.example/story?x=1&y=2",
    title: "Product story",
    sourceExcerpt: "Excerpt",
    publishedAt: "2026-07-17T05:00:00.000Z",
    discoveredAt: "2026-07-17T05:01:00.000Z",
    titleHash: "product-story",
  });
  return createStory(env.DB, {
    ingestedItemId: item.id,
    slug: "product-story",
    headlineZhHk: "產品消息 & 測試",
    summaryZhHk: "公司公布新的人工智能產品資訊。",
    keyFacts: ["公司公布產品", "資料包括功能描述", "詳情以來源為準"],
    category: "產品與公司",
    namedEntities: ["Example Co"],
    sourceName: "來源 & 測試社",
    sourceUrl: "https://publisher.example/story?x=1&y=2",
    sourcePublishedAt: "2026-07-17T05:00:00.000Z",
    publishedAt: "2026-07-17T05:10:00.000Z",
    status: "published",
    modelId: "@cf/test/model",
    promptVersion: "test-v1",
  });
}

describe("machine-readable feeds", () => {
  beforeEach(clearDatabase);

  it("returns escaped RSS 2.0 for published stories", async () => {
    await seedStory();
    const response = await worker.fetch(new Request("https://ainews.cchk.uk/rss.xml"), env);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/rss+xml");
    expect(body).toContain("<rss version=\"2.0\">");
    expect(body).toContain("產品消息 &amp; 測試");
    expect(body).toContain("https://ainews.cchk.uk/story/product-story");
    expect(body).toContain("https://publisher.example/story?x=1&amp;y=2");
  });

  it("returns only published digest and story URLs in the sitemap", async () => {
    const storyId = await seedStory();
    await upsertDigest(env.DB, {
      digestDate: "2026-07-17",
      headlineZhHk: "每日摘要",
      introZhHk: "摘要",
      sections: [{ category: "產品與公司", summaryZhHk: "產品消息", storyIds: [storyId] }],
      status: "published",
      modelId: "@cf/test/model",
      promptVersion: "test-v1",
      publishedAt: "2026-07-17T06:00:00.000Z",
    });
    const digest = await env.DB.prepare("SELECT id FROM digests WHERE digest_date = ?")
      .bind("2026-07-17")
      .first<{ id: number }>();
    if (!digest) throw new Error("digest fixture missing");
    const story = await env.DB.prepare("SELECT * FROM stories WHERE id = ?").bind(storyId).first<any>();
    await replaceDigestStories(env.DB, digest.id, [story]);

    const response = await worker.fetch(new Request("https://ainews.cchk.uk/sitemap.xml"), env);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<urlset");
    expect(body).toContain("https://ainews.cchk.uk/digest/2026-07-17");
    expect(body).toContain("https://ainews.cchk.uk/story/product-story");
  });
});
