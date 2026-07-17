import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import worker from "../../src/index";
import { upsertIngestedItem } from "../../src/db/repositories/items";
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

async function seedStory(): Promise<void> {
  const sourceId = await createSource(env.DB, {
    name: "Metadata Source",
    publisherUrl: "https://publisher.example",
    feedUrl: "https://publisher.example/meta.xml",
    defaultCategory: "政策與安全",
    language: "en",
  });
  const item = await upsertIngestedItem(env.DB, {
    sourceId,
    guid: "metadata-1",
    canonicalUrl: "https://publisher.example/metadata",
    title: "Metadata story",
    sourceExcerpt: "Excerpt",
    publishedAt: "2026-07-17T05:00:00.000Z",
    discoveredAt: "2026-07-17T05:01:00.000Z",
    titleHash: "metadata-story",
  });
  await createStory(env.DB, {
    ingestedItemId: item.id,
    slug: "metadata-story",
    headlineZhHk: "政策與安全測試文章",
    summaryZhHk: "這是一篇用來測試文章 metadata 的摘要。",
    keyFacts: ["政策消息已公布", "來源提供背景", "詳情以原文為準"],
    category: "政策與安全",
    namedEntities: ["Example Authority"],
    sourceName: "Metadata Source",
    sourceUrl: "https://publisher.example/metadata",
    sourcePublishedAt: "2026-07-17T05:00:00.000Z",
    publishedAt: "2026-07-17T05:10:00.000Z",
    status: "published",
    modelId: "@cf/test/model",
    promptVersion: "test-v1",
  });
}

describe("HTML metadata", () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedStory();
  });

  it("renders canonical, Open Graph, and Article JSON-LD metadata", async () => {
    const response = await worker.fetch(new Request("https://ainews.cchk.uk/story/metadata-story"), env);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<link rel="canonical" href="https://ainews.cchk.uk/story/metadata-story"');
    expect(body).toContain('<meta property="og:locale" content="zh_HK"');
    expect(body).toContain('<meta property="og:type" content="article"');
    expect(body).toContain("<meta property=\"article:published_time\"");
    expect(body).toContain('"@type":"NewsArticle"');
    expect(body).toContain('"inLanguage":"zh-HK"');
    expect(body).toContain("Metadata Source");
    expect(body).not.toContain("test-admin-token");
  });
});
