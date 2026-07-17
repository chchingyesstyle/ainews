import type { IngestedItemWithSource, NewIngestedItem } from "../types";

const MAX_RECENT_NEW_ITEMS = 200;

export async function upsertIngestedItem(
  db: D1Database,
  item: NewIngestedItem,
): Promise<{ id: number; inserted: boolean }> {
  const existing = await db
    .prepare(`SELECT id FROM ingested_items WHERE canonical_url = ?`)
    .bind(item.canonicalUrl)
    .first<{ id: number }>();

  if (existing) {
    return { id: existing.id, inserted: false };
  }

  const result = await db
    .prepare(
      `INSERT INTO ingested_items
        (source_id, guid, canonical_url, title, source_excerpt, published_at, discovered_at, title_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
    )
    .bind(
      item.sourceId,
      item.guid,
      item.canonicalUrl,
      item.title,
      item.sourceExcerpt,
      item.publishedAt,
      item.discoveredAt,
      item.titleHash,
    )
    .run();

  return { id: Number(result.meta.last_row_id), inserted: true };
}

export async function getRecentNewItems(
  db: D1Database,
  since: string,
): Promise<IngestedItemWithSource[]> {
  const result = await db
    .prepare(
      `SELECT i.*, s.name AS source_name, s.id AS source_priority, s.default_category AS default_category
       FROM ingested_items i
       JOIN sources s ON s.id = i.source_id
       WHERE i.status = 'new' AND i.discovered_at >= ?
       ORDER BY i.published_at DESC, i.id DESC
       LIMIT ?`,
    )
    .bind(since, MAX_RECENT_NEW_ITEMS)
    .all<IngestedItemWithSource>();
  return result.results;
}

export async function markItemSelected(db: D1Database, itemId: number): Promise<void> {
  await db.prepare(`UPDATE ingested_items SET status = 'selected' WHERE id = ?`).bind(itemId).run();
}

export async function markItemPublished(db: D1Database, itemId: number): Promise<void> {
  await db.prepare(`UPDATE ingested_items SET status = 'published' WHERE id = ?`).bind(itemId).run();
}

export async function markItemFailed(db: D1Database, itemId: number, error: string): Promise<void> {
  await db
    .prepare(`UPDATE ingested_items SET status = 'failed', last_error = ? WHERE id = ?`)
    .bind(error.slice(0, 500), itemId)
    .run();
}
