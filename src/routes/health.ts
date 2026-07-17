export interface LastRun {
  runKey: string;
  status: string;
  finishedAt: string | null;
}

export function healthPayload(
  database: "ok" | "error",
  lastRun: LastRun | null,
): { ok: boolean; database: "ok" | "error"; lastRun: LastRun | null } {
  return {
    ok: database === "ok",
    database,
    lastRun,
  };
}

export async function getHealth(env: {
  DB: D1Database;
}): Promise<{ status: 200 | 503; body: ReturnType<typeof healthPayload> }> {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    const row = await env.DB
      .prepare(
        "SELECT run_key, status, finished_at FROM pipeline_runs ORDER BY id DESC LIMIT 1",
      )
      .first<{
        run_key: string;
        status: string;
        finished_at: string | null;
      }>();

    return {
      status: 200,
      body: healthPayload(
        "ok",
        row
          ? {
              runKey: row.run_key,
              status: row.status,
              finishedAt: row.finished_at,
            }
          : null,
      ),
    };
  } catch {
    return {
      status: 503,
      body: healthPayload("error", null),
    };
  }
}
