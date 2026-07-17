import type { Category, DigestRecord, StoryRecord } from "../types";

const MAX_RESULTS = 50;

function limitValue(limit: number, fallback: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), MAX_RESULTS);
}

export async function getLatestPublishedDigest(db: D1Database): Promise<DigestRecord | null> {
  return db
    .prepare(
      `SELECT * FROM digests
       WHERE status IN ('published', 'partial')
       ORDER BY digest_date DESC, id DESC
       LIMIT 1`,
    )
    .first<DigestRecord>();
}

export async function getPublishedDigestByDate(
  db: D1Database,
  date: string,
): Promise<DigestRecord | null> {
  return db
    .prepare(
      `SELECT * FROM digests
       WHERE digest_date = ? AND status IN ('published', 'partial')`,
    )
    .bind(date)
    .first<DigestRecord>();
}

export async function getLatestPublishedStories(
  db: D1Database,
  limit = 12,
): Promise<StoryRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM stories
       WHERE status = 'published'
       ORDER BY published_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(limitValue(limit, 12))
    .all<StoryRecord>();
  return result.results;
}

export async function getPublishedStoryBySlug(
  db: D1Database,
  slug: string,
): Promise<StoryRecord | null> {
  return db
    .prepare(`SELECT * FROM stories WHERE slug = ? AND status = 'published'`)
    .bind(slug)
    .first<StoryRecord>();
}

export async function getPublishedStoriesByCategory(
  db: D1Database,
  category: Category,
  limit = 50,
): Promise<StoryRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM stories
       WHERE status = 'published' AND category = ?
       ORDER BY published_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(category, limitValue(limit, 50))
    .all<StoryRecord>();
  return result.results;
}

export async function searchPublishedStories(
  db: D1Database,
  query: string,
  limit = 50,
): Promise<StoryRecord[]> {
  const term = `%${query.trim()}%`;
  const result = await db
    .prepare(
      `SELECT * FROM stories
       WHERE status = 'published'
         AND (
           lower(headline_zh_hk) LIKE lower(?)
           OR lower(summary_zh_hk) LIKE lower(?)
           OR lower(source_name) LIKE lower(?)
         )
       ORDER BY published_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(term, term, term, limitValue(limit, 50))
    .all<StoryRecord>();
  return result.results;
}

export async function getStoriesForDigest(
  db: D1Database,
  digestId: number,
): Promise<StoryRecord[]> {
  const result = await db
    .prepare(
      `SELECT s.* FROM stories s
       JOIN digest_stories ds ON ds.story_id = s.id
       WHERE ds.digest_id = ? AND s.status = 'published'
       ORDER BY ds.position ASC, s.id ASC`,
    )
    .bind(digestId)
    .all<StoryRecord>();
  return result.results;
}

export async function getRelatedPublishedStories(
  db: D1Database,
  story: StoryRecord,
  limit = 4,
): Promise<StoryRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM stories
       WHERE status = 'published' AND category = ? AND id != ?
       ORDER BY published_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(story.category, story.id, limitValue(limit, 4))
    .all<StoryRecord>();
  return result.results;
}

export async function getPublishedStoriesByIds(
  db: D1Database,
  storyIds: number[],
): Promise<StoryRecord[]> {
  if (storyIds.length === 0) return [];
  const ids = storyIds.filter((id) => Number.isInteger(id)).slice(0, MAX_RESULTS);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT * FROM stories WHERE status = 'published' AND id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<StoryRecord>();
  const byId = new Map(result.results.map((story) => [story.id, story]));
  return ids.flatMap((id) => {
    const story = byId.get(id);
    return story ? [story] : [];
  });
}
