import type { StoryRecord } from "../db/types";
import { createStory, getStoryById, getStoryByIngestedItemId } from "../db/repositories/stories";
import { markItemFailed, markItemPublished } from "../db/repositories/items";
import { summarizeStory } from "../ai/summarizeStory";
import type { Env } from "../env";
import type { FeedItem } from "../feeds/types";

export interface ProcessableItem extends FeedItem {
  id: number;
  sourceName: string;
}

export interface PublishedStory {
  ok: true;
  item: ProcessableItem;
  story: StoryRecord;
}

export interface FailedStory {
  ok: false;
  item: ProcessableItem;
  error: string;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown story error").slice(0, 500);
}

export function slugFromHeadline(headline: string): string {
  const base = headline
    .normalize("NFKC")
    .toLocaleLowerCase("zh-HK")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
  return base || "ai-news";
}

async function createStoryWithCollisionSuffix(
  env: Env,
  item: ProcessableItem,
  output: Awaited<ReturnType<typeof summarizeStory>>,
): Promise<number> {
  const baseSlug = slugFromHeadline(output.headline_zh_hk);
  const publishedAt = new Date().toISOString();

  for (let suffix = 0; suffix < 20; suffix += 1) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    try {
      return await createStory(env.DB, {
        ingestedItemId: item.id,
        slug,
        headlineZhHk: output.headline_zh_hk,
        summaryZhHk: output.summary_zh_hk,
        keyFacts: output.key_facts,
        category: output.category,
        namedEntities: output.named_entities,
        sourceName: item.sourceName,
        sourceUrl: item.canonicalUrl,
        sourcePublishedAt: item.publishedAt,
        publishedAt,
        status: "published",
        modelId: env.AI_MODEL_ID,
        promptVersion: env.PROMPT_VERSION,
      });
    } catch (error) {
      const message = errorMessage(error);
      if (!/unique|constraint/i.test(message)) throw error;
    }
  }

  throw new Error("could not create a unique story slug");
}

export async function processStory(
  env: Env,
  item: ProcessableItem,
): Promise<PublishedStory | FailedStory> {
  const existing = await getStoryByIngestedItemId(env.DB, item.id);
  if (existing) return { ok: true, item, story: existing };

  try {
    const output = await summarizeStory(env.AI, {
      modelId: env.AI_MODEL_ID,
      sourceName: item.sourceName,
      title: item.title,
      publishedAt: item.publishedAt,
      excerpt: item.excerpt,
      canonicalUrl: item.canonicalUrl,
    });
    const storyId = await createStoryWithCollisionSuffix(env, item, output);
    await markItemPublished(env.DB, item.id);
    const story = await getStoryById(env.DB, storyId);
    if (!story) throw new Error("published story could not be read back");
    return { ok: true, item, story };
  } catch (error) {
    const message = errorMessage(error);
    await markItemFailed(env.DB, item.id, message);
    return { ok: false, item, error: message };
  }
}
