import type { DigestRecord, NewDigest, StoryRecord } from "../types";

export async function upsertDigest(db: D1Database, digest: NewDigest): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO digests
        (digest_date, headline_zh_hk, intro_zh_hk, sections_json, status, model_id, prompt_version, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(digest_date) DO UPDATE SET
        headline_zh_hk = excluded.headline_zh_hk,
        intro_zh_hk = excluded.intro_zh_hk,
        sections_json = excluded.sections_json,
        status = excluded.status,
        model_id = excluded.model_id,
        prompt_version = excluded.prompt_version,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at`,
    )
    .bind(
      digest.digestDate,
      digest.headlineZhHk,
      digest.introZhHk,
      JSON.stringify(digest.sections),
      digest.status,
      digest.modelId,
      digest.promptVersion,
      digest.publishedAt,
      now,
      now,
    )
    .run();

  const row = await db
    .prepare(`SELECT id FROM digests WHERE digest_date = ?`)
    .bind(digest.digestDate)
    .first<{ id: number }>();

  return row?.id ?? Number(result.meta.last_row_id);
}

export async function replaceDigestStories(
  db: D1Database,
  digestId: number,
  stories: StoryRecord[],
): Promise<void> {
  await db.prepare(`DELETE FROM digest_stories WHERE digest_id = ?`).bind(digestId).run();
  if (stories.length === 0) return;

  await db.batch(
    stories.map((story, index) =>
      db
        .prepare(
          `INSERT INTO digest_stories (digest_id, story_id, position) VALUES (?, ?, ?)`,
        )
        .bind(digestId, story.id, index),
    ),
  );
}

export async function getDigestByDate(
  db: D1Database,
  digestDate: string,
): Promise<DigestRecord | null> {
  return db
    .prepare(`SELECT * FROM digests WHERE digest_date = ?`)
    .bind(digestDate)
    .first<DigestRecord>();
}
