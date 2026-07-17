import type { RunResult } from "../types";

export async function startRun(db: D1Database, runKey: string): Promise<number> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO pipeline_runs (run_key, started_at, status)
       VALUES (?, ?, 'running')
       ON CONFLICT(run_key) DO UPDATE SET started_at = excluded.started_at, status = 'running', finished_at = NULL`,
    )
    .bind(runKey, now)
    .run();

  const row = await db
    .prepare(`SELECT id FROM pipeline_runs WHERE run_key = ?`)
    .bind(runKey)
    .first<{ id: number }>();
  if (!row) throw new Error("pipeline run was not created");
  return row.id;
}

export async function finishRun(
  db: D1Database,
  runId: number,
  result: RunResult,
): Promise<void> {
  await db
    .prepare(
      `UPDATE pipeline_runs
       SET finished_at = ?, status = ?, feeds_attempted = ?, feeds_succeeded = ?,
           items_discovered = ?, stories_selected = ?, stories_published = ?, digest_id = ?, errors_json = ?
       WHERE id = ?`,
    )
    .bind(
      new Date().toISOString(),
      result.status,
      result.feedsAttempted,
      result.feedsSucceeded,
      result.itemsDiscovered,
      result.storiesSelected,
      result.storiesPublished,
      result.digestId,
      JSON.stringify(result.errors.slice(0, 50)),
      runId,
    )
    .run();
}
