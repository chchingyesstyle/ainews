import type { DigestAiOutput, DigestStoryInput } from "../ai/contracts";
import { createDigest } from "../ai/createDigest";
import { collectFromFeeds, collectFromGdelt, type FeedFetcher } from "../feeds/collectFeeds";
import type { FeedItem } from "../feeds/types";
import {
  getRecentNewItems,
  markItemSelected,
  pruneExpiredUnreferencedItems,
  upsertIngestedItem,
} from "../db/repositories/items";
import { getPublishedStoriesForDigest } from "../db/repositories/stories";
import { getDigestByDate, replaceDigestStories, upsertDigest } from "../db/repositories/digests";
import {
  createSource,
  getEnabledSources,
  getSourceByFeedUrl,
  recordSourceFailure,
  recordSourceSuccess,
} from "../db/repositories/sources";
import { finishRun, startRun } from "../db/repositories/runs";
import type { Category, RunResult, StoryRecord } from "../db/types";
import type { Env } from "../env";
import { processStory, type ProcessableItem, type PublishedStory } from "./processStory";
import { selectCandidates } from "./selectCandidates";

const GDELT_FEED_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_QUERY = "artificial intelligence OR generative AI OR machine learning";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS_TO_INGEST = 200;
const RETENTION_DAYS = 90;

export type RetentionPruner = (
  db: D1Database,
  cutoff: string,
) => Promise<number>;

export interface PipelineOptions {
  date?: string;
  dryRun?: boolean;
  now?: Date;
  fetcher?: FeedFetcher;
  gdeltQuery?: string;
  retentionPruner?: RetentionPruner;
}

export interface PipelineResult extends RunResult {
  dryRun: boolean;
}

function dateFor(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown pipeline error").slice(0, 500);
}

function sinceFor(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - DAY_MS).toISOString();
}

function retentionCutoffFor(now: Date): string {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString();
}

export function limitItemsForIngestion(
  items: FeedItem[],
  limit = MAX_ITEMS_TO_INGEST,
): FeedItem[] {
  if (limit <= 0 || items.length === 0) return [];

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftTime = left.item.publishedAt ? Date.parse(left.item.publishedAt) : 0;
      const rightTime = right.item.publishedAt ? Date.parse(right.item.publishedAt) : 0;
      const difference = (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime);
      return difference || left.index - right.index;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

function asProcessableItem(
  item: FeedItem & { id: number; sourceName?: string },
): ProcessableItem {
  return {
    ...item,
    id: item.id,
    sourceName: item.sourceName ?? "來源不明",
  };
}

function storedItemToFeedItem(item: {
  id: number;
  source_id: number;
  source_name: string;
  source_priority: number;
  default_category: Category;
  guid: string | null;
  canonical_url: string;
  title: string;
  source_excerpt: string | null;
  published_at: string | null;
  title_hash: string;
}): FeedItem & { id: number; sourceName: string } {
  return {
    id: item.id,
    sourceId: item.source_id,
    sourceName: item.source_name,
    sourcePriority: item.source_priority,
    defaultCategory: item.default_category,
    guid: item.guid,
    canonicalUrl: item.canonical_url,
    title: item.title,
    excerpt: item.source_excerpt,
    publishedAt: item.published_at,
    titleHash: item.title_hash,
  };
}

function partialDigest(stories: StoryRecord[]): {
  headline_zh_hk: string;
  intro_zh_hk: string;
  sections: Array<{ category: Category; summaryZhHk: string; storyIds: number[] }>;
} {
  const grouped = new Map<Category, StoryRecord[]>();
  for (const story of stories) {
    const current = grouped.get(story.category) ?? [];
    current.push(story);
    grouped.set(story.category, current);
  }

  return {
    headline_zh_hk: "今日人工智能摘要（資料有限）",
    intro_zh_hk: "今日可供整理的有效新聞資料有限，以下只列出已成功整理的內容；詳情請以來源原文為準。",
    sections: [...grouped.entries()].map(([category, categoryStories]) => ({
      category,
      summaryZhHk: categoryStories.map((story) => story.headline_zh_hk).join("；").slice(0, 1_200),
      storyIds: categoryStories.map((story) => story.id),
    })),
  };
}

async function persistDigest(
  env: Env,
  date: string,
  stories: StoryRecord[],
  errors: string[],
): Promise<number | null> {
  if (stories.length === 0) return null;

  let headline: string;
  let intro: string;
  let sections: Array<{ category: Category; summaryZhHk: string; storyIds: number[] }>;
  let status: "published" | "partial";

  if (stories.length < 3) {
    const partial = partialDigest(stories);
    headline = partial.headline_zh_hk;
    intro = partial.intro_zh_hk;
    sections = partial.sections;
    status = "partial";
  } else {
    const input: DigestStoryInput[] = stories.map((story) => ({
      id: story.id,
      headline_zh_hk: story.headline_zh_hk,
      summary_zh_hk: story.summary_zh_hk,
      key_facts: JSON.parse(story.key_facts_json) as string[],
      category: story.category,
    }));

    try {
      const output: DigestAiOutput = await createDigest(env.AI, {
        modelId: env.AI_MODEL_ID,
        stories: input,
      });
      headline = output.headline_zh_hk;
      intro = output.intro_zh_hk;
      sections = output.sections.map((section) => ({
        category: section.category,
        summaryZhHk: section.summary_zh_hk,
        storyIds: section.story_ids,
      }));
      status = "published";
    } catch (error) {
      errors.push(`Digest: ${errorMessage(error)}`);
      const partial = partialDigest(stories);
      headline = partial.headline_zh_hk;
      intro = partial.intro_zh_hk;
      sections = partial.sections;
      status = "partial";
    }
  }

  const digestId = await upsertDigest(env.DB, {
    digestDate: date,
    headlineZhHk: headline,
    introZhHk: intro,
    sections,
    status,
    modelId: env.AI_MODEL_ID,
    promptVersion: env.PROMPT_VERSION,
    publishedAt: new Date().toISOString(),
  });
  const storyIds = new Set(sections.flatMap((section) => section.storyIds));
  await replaceDigestStories(env.DB, digestId, stories.filter((story) => storyIds.has(story.id)));
  return digestId;
}

async function runDryPipeline(
  env: Env,
  options: Required<Pick<PipelineOptions, "date" | "dryRun">> & PipelineOptions,
): Promise<PipelineResult> {
  const sources = await getEnabledSources(env.DB);
  const fetched = await collectFromFeeds(sources, options.fetcher);
  const errors = [...fetched.errors];
  let items = [...fetched.items];
  try {
    items = items.concat(await collectFromGdelt(options.gdeltQuery ?? GDELT_QUERY, options.fetcher));
  } catch (error) {
    errors.push(`GDELT: ${errorMessage(error)}`);
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const candidates = selectCandidates(
    items.map((item) => ({
      ...item,
      sourceName: sourceById.get(item.sourceId)?.name ?? "GDELT",
      sourcePriority: sourceById.get(item.sourceId)?.id ?? Number.MAX_SAFE_INTEGER,
      defaultCategory: sourceById.get(item.sourceId)?.default_category ?? "模型與研究",
    })),
  );
  let storiesPublished = 0;
  const dryStories: StoryRecord[] = [];
  for (const [index, candidate] of candidates.entries()) {
    try {
      const output = await (await import("../ai/summarizeStory")).summarizeStory(env.AI, {
        modelId: env.AI_MODEL_ID,
        sourceName: candidate.sourceName ?? "GDELT",
        title: candidate.title,
        publishedAt: candidate.publishedAt,
        excerpt: candidate.excerpt,
        canonicalUrl: candidate.canonicalUrl,
      });
      storiesPublished += 1;
      dryStories.push({
        id: index + 1,
        ingested_item_id: index + 1,
        slug: "dry-run",
        headline_zh_hk: output.headline_zh_hk,
        summary_zh_hk: output.summary_zh_hk,
        key_facts_json: JSON.stringify(output.key_facts),
        category: output.category,
        named_entities_json: JSON.stringify(output.named_entities),
        source_name: candidate.sourceName ?? "GDELT",
        source_url: candidate.canonicalUrl,
        source_published_at: candidate.publishedAt,
        published_at: new Date().toISOString(),
        status: "published",
        model_id: env.AI_MODEL_ID,
        prompt_version: env.PROMPT_VERSION,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      errors.push(`Story ${candidate.title}: ${errorMessage(error)}`);
    }
  }

  if (dryStories.length >= 3) {
    try {
      await createDigest(env.AI, {
        modelId: env.AI_MODEL_ID,
        stories: dryStories.map((story) => ({
          id: story.id,
          headline_zh_hk: story.headline_zh_hk,
          summary_zh_hk: story.summary_zh_hk,
          key_facts: JSON.parse(story.key_facts_json) as string[],
          category: story.category,
        })),
      });
    } catch (error) {
      errors.push(`Digest: ${errorMessage(error)}`);
    }
  }

  return {
    dryRun: true,
    status: dryStories.length === 0 ? "failed" : errors.length > 0 ? "partial" : "completed",
    feedsAttempted: fetched.feedsAttempted,
    feedsSucceeded: fetched.feedsSucceeded,
    itemsDiscovered: items.length,
    storiesSelected: candidates.length,
    storiesPublished,
    digestId: null,
    errors,
  };
}

export async function runDailyPipeline(
  env: Env,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const now = options.now ?? new Date();
  const date = options.date ?? dateFor(now);
  const dryRun = options.dryRun ?? false;
  if (dryRun) return runDryPipeline(env, { ...options, date, dryRun });

  const result: PipelineResult = {
    dryRun: false,
    status: "failed",
    feedsAttempted: 0,
    feedsSucceeded: 0,
    itemsDiscovered: 0,
    storiesSelected: 0,
    storiesPublished: 0,
    digestId: null,
    errors: [],
  };
  let runId: number | null = null;

  try {
    runId = await startRun(env.DB, date);
    try {
      const pruneItems = options.retentionPruner ?? pruneExpiredUnreferencedItems;
      await pruneItems(env.DB, retentionCutoffFor(now));
    } catch (error) {
      result.errors.push(`Retention cleanup: ${errorMessage(error)}`);
    }
    const sources = await getEnabledSources(env.DB);
    const fetched = await collectFromFeeds(sources, options.fetcher);
    result.feedsAttempted = fetched.feedsAttempted;
    result.feedsSucceeded = fetched.feedsSucceeded;
    result.itemsDiscovered = fetched.items.length;
    result.errors.push(...fetched.errors);

    const fetchedAt = now.toISOString();
    await Promise.all([
      ...fetched.succeededSourceIds.map((sourceId) => recordSourceSuccess(env.DB, sourceId, fetchedAt)),
      ...fetched.failedSourceIds.map((sourceId) => recordSourceFailure(env.DB, sourceId, fetchedAt)),
    ]);

    const gdeltSource =
      (await getSourceByFeedUrl(env.DB, GDELT_FEED_URL)) ??
      ({
        id: await createSource(env.DB, {
          name: "GDELT",
          publisherUrl: "https://www.gdeltproject.org",
          feedUrl: GDELT_FEED_URL,
          defaultCategory: "模型與研究",
          language: "multi",
          enabled: 0,
        }),
      } as const);
    try {
      const gdeltItems = await collectFromGdelt(options.gdeltQuery ?? GDELT_QUERY, options.fetcher);
      fetched.items.push(
        ...gdeltItems.map((item) => ({
          ...item,
          sourceId: gdeltSource.id,
          sourceName: "GDELT",
          sourcePriority: gdeltSource.id,
          defaultCategory: "模型與研究" as const,
        })),
      );
      result.itemsDiscovered += gdeltItems.length;
    } catch (error) {
      result.errors.push(`GDELT: ${errorMessage(error)}`);
    }

    const discoveredAt = now.toISOString();
    for (const item of limitItemsForIngestion(fetched.items)) {
      try {
        await upsertIngestedItem(env.DB, {
          sourceId: item.sourceId,
          guid: item.guid,
          canonicalUrl: item.canonicalUrl,
          title: item.title,
          sourceExcerpt: item.excerpt,
          publishedAt: item.publishedAt,
          discoveredAt,
          titleHash: item.titleHash,
        });
      } catch (error) {
        result.errors.push(`Item ${item.title}: ${errorMessage(error)}`);
      }
    }

    const stored = await getRecentNewItems(env.DB, sinceFor(date));
    const candidates = selectCandidates(stored.map(storedItemToFeedItem));
    result.storiesSelected = candidates.length;
    await Promise.all(
      candidates
        .filter((item) => item.id !== undefined)
        .map((item) => markItemSelected(env.DB, item.id as number)),
    );

    const published: PublishedStory[] = [];
    for (const item of candidates) {
      const processed = await processStory(env, asProcessableItem(item as FeedItem & { id: number; sourceName?: string }));
      if (processed.ok) {
        published.push(processed);
      } else {
        result.errors.push(`Story ${processed.item.title}: ${processed.error}`);
      }
    }
    result.storiesPublished = published.length;

    const existingDigest = await getDigestByDate(env.DB, date);
    const storiesForDigest = await getPublishedStoriesForDigest(env.DB, sinceFor(date));
    if (storiesForDigest.length > 0 && (candidates.length > 0 || !existingDigest)) {
      result.digestId = await persistDigest(env, date, storiesForDigest, result.errors);
    } else if (existingDigest) {
      result.digestId = existingDigest.id;
    }

    if (storiesForDigest.length === 0) {
      result.errors.push("No valid stories were published");
      result.status = "failed";
    } else if (storiesForDigest.length < 3 || result.errors.length > 0 || !result.digestId) {
      result.status = "partial";
    } else {
      result.status = "completed";
    }
  } catch (error) {
    result.errors.push(errorMessage(error));
    result.status = "failed";
  }

  if (runId !== null) await finishRun(env.DB, runId, result);
  return result;
}
