import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createSource, getEnabledSources } from "../../src/db/repositories/sources";
import { upsertIngestedItem } from "../../src/db/repositories/items";
import { createStory } from "../../src/db/repositories/stories";
import { getPublishedStoriesByEntity, getRelatedPublishedStories } from "../../src/db/repositories/public";
import type { Category, StoryRecord } from "../../src/db/types";

describe("source repository", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM sources").run();
  });

  it("creates and reads an enabled source", async () => {
    await createSource(env.DB, {
      name: "Example AI",
      publisherUrl: "https://example.com",
      feedUrl: "https://example.com/feed.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });

    await expect(getEnabledSources(env.DB)).resolves.toEqual([
      expect.objectContaining({
        name: "Example AI",
        feed_url: "https://example.com/feed.xml",
        enabled: 1,
      }),
    ]);
  });
});

describe("public story repository", () => {
  async function clearDatabase(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM digest_stories"),
      env.DB.prepare("DELETE FROM digests"),
      env.DB.prepare("DELETE FROM stories"),
      env.DB.prepare("DELETE FROM ingested_items"),
      env.DB.prepare("DELETE FROM sources"),
    ]);
  }

  async function seedStory(options: {
    slug: string;
    category: Category;
    namedEntities: string[];
    publishedAt: string;
  }): Promise<StoryRecord> {
    const sourceId = await createSource(env.DB, {
      name: "Repo Source",
      publisherUrl: "https://publisher.example",
      feedUrl: `https://publisher.example/${options.slug}.xml`,
      defaultCategory: options.category,
      language: "en",
    });
    const item = await upsertIngestedItem(env.DB, {
      sourceId,
      guid: options.slug,
      canonicalUrl: `https://publisher.example/${options.slug}`,
      title: options.slug,
      sourceExcerpt: "Excerpt",
      publishedAt: options.publishedAt,
      discoveredAt: options.publishedAt,
      titleHash: options.slug,
    });
    const storyId = await createStory(env.DB, {
      ingestedItemId: item.id,
      slug: options.slug,
      headlineZhHk: `標題 ${options.slug}`,
      summaryZhHk: `摘要 ${options.slug}`,
      keyFacts: ["重點一", "重點二", "重點三"],
      category: options.category,
      namedEntities: options.namedEntities,
      sourceName: "Repo Source",
      sourceUrl: `https://publisher.example/${options.slug}`,
      sourcePublishedAt: options.publishedAt,
      publishedAt: options.publishedAt,
      status: "published",
      modelId: "@cf/test/model",
      promptVersion: "test-v1",
    });
    const story = await env.DB.prepare("SELECT * FROM stories WHERE id = ?")
      .bind(storyId)
      .first<StoryRecord>();
    if (!story) throw new Error("story fixture missing");
    return story;
  }

  beforeEach(async () => {
    await clearDatabase();
  });

  it("finds stories by exact entity without matching wildcard-like substrings", async () => {
    await seedStory({ slug: "literal-percent", category: "產品與公司", namedEntities: ["A%B"], publishedAt: "2026-07-17T05:00:00.000Z" });
    await seedStory({ slug: "unrelated-wildcard-victim", category: "產品與公司", namedEntities: ["AxyzB"], publishedAt: "2026-07-17T05:05:00.000Z" });

    const matches = await getPublishedStoriesByEntity(env.DB, "A%B", 10);

    expect(matches.map((story) => story.slug)).toEqual(["literal-percent"]);
  });

  it("re-ranks related stories by shared entities ahead of pure recency", async () => {
    const target = await seedStory({
      slug: "target-story",
      category: "模型與研究",
      namedEntities: ["OpenAI"],
      publishedAt: "2026-07-17T05:00:00.000Z",
    });
    await seedStory({
      slug: "older-shared-entity",
      category: "模型與研究",
      namedEntities: ["OpenAI"],
      publishedAt: "2026-07-15T05:00:00.000Z",
    });
    await seedStory({
      slug: "newer-no-shared-entity",
      category: "模型與研究",
      namedEntities: ["Anthropic"],
      publishedAt: "2026-07-16T05:00:00.000Z",
    });

    const related = await getRelatedPublishedStories(env.DB, target, 4);

    expect(related.map((story) => story.slug)).toEqual(["older-shared-entity", "newer-no-shared-entity"]);
  });
});
