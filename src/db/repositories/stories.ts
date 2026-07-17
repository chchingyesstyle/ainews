import type { NewStory, StoryRecord } from "../types";

export async function createStory(db: D1Database, story: NewStory): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO stories
        (ingested_item_id, slug, headline_zh_hk, summary_zh_hk, key_facts_json, category, named_entities_json,
         source_name, source_url, source_published_at, published_at, status, model_id, prompt_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      story.ingestedItemId,
      story.slug,
      story.headlineZhHk,
      story.summaryZhHk,
      JSON.stringify(story.keyFacts),
      story.category,
      JSON.stringify(story.namedEntities),
      story.sourceName,
      story.sourceUrl,
      story.sourcePublishedAt,
      story.publishedAt,
      story.status,
      story.modelId,
      story.promptVersion,
      now,
      now,
    )
    .run();

  return Number(result.meta.last_row_id);
}

export async function getPublishedStoriesForDigest(
  db: D1Database,
  since: string,
): Promise<StoryRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM stories WHERE status = 'published' AND published_at >= ? ORDER BY published_at DESC, id DESC`,
    )
    .bind(since)
    .all<StoryRecord>();
  return result.results;
}
