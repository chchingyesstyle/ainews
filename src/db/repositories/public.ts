import type { Category, DigestRecord, StoryRecord } from "../types";

const MAX_RESULTS = 50;
const RELATED_CANDIDATE_POOL_SIZE = 20;

function limitValue(limit: number, fallback: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), MAX_RESULTS);
}

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseNamedEntities(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entity): entity is string => typeof entity === "string") : [];
  } catch {
    return [];
  }
}

function countSharedEntities(a: string[], b: string[]): number {
  const bSet = new Set(b);
  return a.filter((entity) => bSet.has(entity)).length;
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
  const boundedLimit = limitValue(limit, 4);
  const result = await db
    .prepare(
      `SELECT * FROM stories
       WHERE status = 'published' AND category = ? AND id != ?
       ORDER BY published_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(story.category, story.id, RELATED_CANDIDATE_POOL_SIZE)
    .all<StoryRecord>();

  const targetEntities = parseNamedEntities(story.named_entities_json);
  const ranked = targetEntities.length === 0
    ? result.results
    : [...result.results].sort((a, b) => {
        const overlapDiff = countSharedEntities(targetEntities, parseNamedEntities(b.named_entities_json))
          - countSharedEntities(targetEntities, parseNamedEntities(a.named_entities_json));
        if (overlapDiff !== 0) return overlapDiff;
        return (b.published_at ?? "").localeCompare(a.published_at ?? "") || b.id - a.id;
      });

  return ranked.slice(0, boundedLimit);
}

export async function getPublishedStoriesByEntity(
  db: D1Database,
  entity: string,
  limit = 50,
): Promise<StoryRecord[]> {
  const pattern = `%"${escapeLikePattern(entity)}"%`;
  const result = await db
    .prepare(
      `SELECT * FROM stories
       WHERE status = 'published' AND named_entities_json LIKE ? ESCAPE '\\'
       ORDER BY published_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(pattern, limitValue(limit, 50))
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

export async function getPublishedDigests(db: D1Database, limit = 5_000): Promise<DigestRecord[]> {
  const result = await db.prepare("SELECT * FROM digests WHERE status IN ('published', 'partial') ORDER BY digest_date DESC LIMIT ?").bind(Math.min(Math.max(Math.floor(limit), 1), 5_000)).all<DigestRecord>();
  return result.results;
}

export async function getPublishedStoriesForSitemap(db: D1Database, limit = 5_000): Promise<StoryRecord[]> {
  const result = await db.prepare("SELECT * FROM stories WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT ?").bind(Math.min(Math.max(Math.floor(limit), 1), 5_000)).all<StoryRecord>();
  return result.results;
}
