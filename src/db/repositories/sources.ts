import type { NewSource, SourceRecord } from "../types";

export async function createSource(db: D1Database, source: NewSource): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO sources
        (name, publisher_url, feed_url, default_category, language, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      source.name,
      source.publisherUrl,
      source.feedUrl,
      source.defaultCategory,
      source.language,
      source.enabled ?? 1,
      now,
      now,
    )
    .run();

  return Number(result.meta.last_row_id);
}
export async function getSourceByFeedUrl(
  db: D1Database,
  feedUrl: string,
): Promise<SourceRecord | null> {
  return db.prepare(`SELECT * FROM sources WHERE feed_url = ?`).bind(feedUrl).first<SourceRecord>();
}

export async function getSourceById(db: D1Database, sourceId: number): Promise<SourceRecord | null> {
  return db.prepare(`SELECT * FROM sources WHERE id = ?`).bind(sourceId).first<SourceRecord>();
}

export async function getEnabledSources(db: D1Database): Promise<SourceRecord[]> {
  const result = await db
    .prepare(`SELECT * FROM sources WHERE enabled = 1 ORDER BY id`)
    .all<SourceRecord>();
  return result.results;
}

export async function recordSourceSuccess(
  db: D1Database,
  sourceId: number,
  fetchedAt: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sources SET last_fetched_at = ?, failure_count = 0, updated_at = ? WHERE id = ?`,
    )
    .bind(fetchedAt, fetchedAt, sourceId)
    .run();
}

export async function recordSourceFailure(
  db: D1Database,
  sourceId: number,
  fetchedAt: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sources SET last_fetched_at = ?, failure_count = failure_count + 1, updated_at = ? WHERE id = ?`,
    )
    .bind(fetchedAt, fetchedAt, sourceId)
    .run();
}
