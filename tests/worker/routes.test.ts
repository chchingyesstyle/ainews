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

async function seedContent(): Promise<{ storyId: number; slug: string }> {
  const sourceId = await createSource(env.DB, {
    name: "研究來源 & Co",
    publisherUrl: "https://publisher.example",
    feedUrl: "https://publisher.example/feed.xml",
    defaultCategory: "模型與研究",
    language: "en",
  });
  const item = await upsertIngestedItem(env.DB, {
    sourceId,
    guid: "story-1",
    canonicalUrl: "https://publisher.example/story?a=1&b=2",
    title: "AI 模型研究進展",
    sourceExcerpt: "Original excerpt",
    publishedAt: "2026-07-17T05:00:00.000Z",
    discoveredAt: "2026-07-17T05:01:00.000Z",
    titleHash: "ai-model-research",
  });
  const storyId = await createStory(env.DB, {
    ingestedItemId: item.id,
    slug: "ai-model-research",
    headlineZhHk: "AI 模型研究新進展",
    summaryZhHk: "研究團隊公布最新測試結果，詳情以原文為準。",
    keyFacts: ["研究團隊公布結果", "測試資料已提供", "完整細節請參閱原文"],
    category: "模型與研究",
    namedEntities: ["Example Lab"],
    sourceName: "研究來源 & Co",
    sourceUrl: "https://publisher.example/story?a=1&b=2",
    sourcePublishedAt: "2026-07-17T05:00:00.000Z",
    publishedAt: "2026-07-17T05:10:00.000Z",
    status: "published",
    modelId: "@cf/test/model",
    promptVersion: "test-v1",
  });
  await upsertDigest(env.DB, {
    digestDate: "2026-07-17",
    headlineZhHk: "今日人工智能焦點",
    introZhHk: "以下內容整理已驗證來源。",
    sections: [{ category: "模型與研究", summaryZhHk: "研究消息。", storyIds: [storyId] }],
    status: "published",
    modelId: "@cf/test/model",
    promptVersion: "test-v1",
    publishedAt: "2026-07-17T06:00:00.000Z",
  });
  const digest = await env.DB.prepare("SELECT id FROM digests WHERE digest_date = ?")
    .bind("2026-07-17")
    .first<{ id: number }>();
  if (!digest) throw new Error("digest fixture missing");
  const story = await env.DB.prepare("SELECT * FROM stories WHERE id = ?")
    .bind(storyId)
    .first<any>();
  await replaceDigestStories(env.DB, digest.id, [story]);
  return { storyId, slug: "ai-model-research" };
}

const request = (path: string): Request => new Request(`https://ainews.cchk.uk${path}`);

describe("public HTML routes", () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedContent();
  });

  it("renders the homepage with the digest lead and source-linked story", async () => {
    const response = await worker.fetch(request("/"), env);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('lang="zh-HK"');
    expect(body).toContain("今日人工智能焦點");
    expect(body).toContain("/digest/2026-07-17");
    expect(body).toContain("AI 模型研究新進展");
    expect(body).toContain("內容由 AI 整理，原文請以來源為準。");
    expect(body).toContain("https://publisher.example/story?a=1&amp;b=2");
  });

  it("renders digest, story, and category pages", async () => {
    const digest = await worker.fetch(request("/digest/2026-07-17"), env);
    const story = await worker.fetch(request("/story/ai-model-research"), env);
    const category = await worker.fetch(request("/category/%E6%A8%A1%E5%9E%8B%E8%88%87%E7%A0%94%E7%A9%B6"), env);

    expect(digest.status).toBe(200);
    expect(await digest.text()).toContain("AI 模型研究新進展");
    expect(story.status).toBe(200);
    const storyBody = await story.text();
    expect(storyBody).toContain("完整細節請參閱原文");
    expect(storyBody).toContain('href="/tag/Example%20Lab"');
    expect(category.status).toBe(200);
    const categoryBody = await category.text();
    expect(categoryBody).toContain("AI 模型研究新進展");
    expect(categoryBody).toContain('href="/category/%E6%A8%A1%E5%9E%8B%E8%88%87%E7%A0%94%E7%A9%B6/rss.xml"');
  });

  it("renders a tag page listing stories that share an entity, and 404s for unknown tags", async () => {
    const tag = await worker.fetch(request("/tag/Example%20Lab"), env);
    const unknownTag = await worker.fetch(request("/tag/%E4%B8%8D%E5%AD%98%E5%9C%A8%E7%9A%84%E5%AF%A6%E9%AB%94"), env);

    expect(tag.status).toBe(200);
    expect(await tag.text()).toContain("AI 模型研究新進展");
    expect(unknownTag.status).toBe(200);
    expect(await unknownTag.text()).toContain("這個主題暫時沒有文章。");
  });

  it("supports search results and a clear empty state", async () => {
    const result = await worker.fetch(request("/search?q=模型研究"), env);
    const empty = await worker.fetch(request("/search?q=不存在的新聞"), env);

    expect(result.status).toBe(200);
    expect(await result.text()).toContain("AI 模型研究新進展");
    expect(empty.status).toBe(200);
    expect(await empty.text()).toContain("未找到符合條件的文章");
  });

  it("returns 404 for an unknown story", async () => {
    const response = await worker.fetch(request("/story/not-found"), env);
    expect(response.status).toBe(404);
  });

  it("renders a digest calendar for the viewed month, and supports navigating to another month", async () => {
    const july = await worker.fetch(request("/digest/2026-07-17"), env);
    const augustView = await worker.fetch(request("/digest/2026-07-17?calendarMonth=2026-08"), env);
    const julyBody = await july.text();
    const augustBody = await augustView.text();

    expect(july.status).toBe(200);
    expect(julyBody).toContain('href="/digest/2026-07-17"');
    expect(julyBody).toContain("2026年7月");
    expect(augustView.status).toBe(200);
    expect(augustBody).toContain("2026年8月");
    expect(augustBody).toMatch(/<details class="digest-date-picker" open(?:="")?>/);
    expect(julyBody).not.toMatch(/<details class="digest-date-picker" open/);
    expect(augustBody).not.toContain('href="/digest/2026-07-17"');
  });

  it("renders the about page with editorial principles and a nav link", async () => {
    const response = await worker.fetch(request("/"), env);
    const homeBody = await response.text();
    const about = await worker.fetch(request("/about"), env);
    const aboutBody = await about.text();

    expect(homeBody).toContain('href="/about"');
    expect(about.status).toBe(200);
    expect(aboutBody).toContain("內容由 AI 整理，原文請以來源為準。");
    expect(aboutBody).toContain("不會加入未提供的事實");
  });
});
