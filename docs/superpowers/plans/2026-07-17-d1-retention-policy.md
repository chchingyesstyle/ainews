# D1 90-Day Retention Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe daily cleanup that removes at most 500 unreferenced, non-published ingestion rows strictly older than 90 days while preserving all published editorial data.

**Architecture:** A focused D1 repository function owns the bounded deletion query. The live daily pipeline computes a UTC cutoff from its injected `now`, calls the repository after starting the run and before collecting feeds, and treats cleanup failure as a non-fatal partial-run error; dry runs never call cleanup.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, Cloudflare D1, Vitest, Wrangler

## Global Constraints

- Delete only `ingested_items` whose `status` is `new`, `selected`, `failed`, or `rejected`.
- Delete only rows with `discovered_at` strictly earlier than `now - 90 days` and no matching `stories.ingested_item_id`.
- Preserve rows exactly at the cutoff, every `published` ingestion row, and all stories, digests, digest-story relationships, sources, and pipeline runs.
- Delete at most 500 rows per live pipeline invocation, ordered oldest first by `discovered_at` then `id`.
- Dry runs perform no cleanup mutation.
- Cleanup failure is bounded, prefixed `Retention cleanup:`, does not stop news processing, and makes an otherwise publishable run `partial`.
- Add no Cron trigger, environment variable, schema column, or D1 migration.
- Deployment must not run ad-hoc deletion SQL; the first scheduled or explicitly authorized live pipeline performs cleanup through application code.

---

### Task 1: Implement the bounded retention repository

**Files:**
- Modify: `src/db/repositories/items.ts`
- Create: `tests/worker/retention.test.ts`

**Interfaces:**
- Consumes: `ingested_items.discovered_at`, `ingested_items.status`, and the `stories.ingested_item_id` foreign-key relationship.
- Produces: `pruneExpiredUnreferencedItems(db: D1Database, cutoff: string, limit?: number): Promise<number>`.

- [ ] **Step 1: Write failing repository tests**

Create `tests/worker/retention.test.ts` with fixtures that insert one source and ingestion rows directly:

```ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { pruneExpiredUnreferencedItems } from "../../src/db/repositories/items";
import { createSource } from "../../src/db/repositories/sources";
import { createStory } from "../../src/db/repositories/stories";

const CUTOFF = "2026-04-18T06:00:00.000Z";

async function insertItem(
  sourceId: number,
  key: string,
  discoveredAt: string,
  status: "new" | "selected" | "published" | "rejected" | "failed",
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO ingested_items
      (source_id, guid, canonical_url, title, source_excerpt, published_at, discovered_at, title_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    sourceId,
    key,
    `https://example.com/${key}`,
    `Story ${key}`,
    "Excerpt",
    discoveredAt,
    discoveredAt,
    `hash-${key}`,
    status,
  ).run();
  return Number(result.meta.last_row_id);
}

describe("ingested item retention", () => {
  let sourceId: number;

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM digest_stories"),
      env.DB.prepare("DELETE FROM pipeline_runs"),
      env.DB.prepare("DELETE FROM digests"),
      env.DB.prepare("DELETE FROM stories"),
      env.DB.prepare("DELETE FROM ingested_items"),
      env.DB.prepare("DELETE FROM sources"),
    ]);
    sourceId = await createSource(env.DB, {
      name: "Example AI",
      publisherUrl: "https://example.com",
      feedUrl: "https://example.com/feed.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
  });

  it("deletes only stale unreferenced non-published rows", async () => {
    const eligibleId = await insertItem(sourceId, "eligible", "2026-04-01T00:00:00.000Z", "failed");
    const boundaryId = await insertItem(sourceId, "boundary", CUTOFF, "failed");
    const recentId = await insertItem(sourceId, "recent", "2026-04-19T00:00:00.000Z", "new");
    const publishedId = await insertItem(sourceId, "published", "2026-03-01T00:00:00.000Z", "published");
    const linkedId = await insertItem(sourceId, "linked", "2026-03-02T00:00:00.000Z", "failed");
    await createStory(env.DB, {
      ingestedItemId: linkedId,
      slug: "linked-story",
      headlineZhHk: "已發佈文章",
      summaryZhHk: "這是已驗證的文章摘要。",
      keyFacts: ["事實一", "事實二", "事實三"],
      category: "模型與研究",
      namedEntities: [],
      sourceName: "Example AI",
      sourceUrl: "https://example.com/linked",
      sourcePublishedAt: "2026-03-02T00:00:00.000Z",
      publishedAt: "2026-03-02T01:00:00.000Z",
      status: "published",
      modelId: "@cf/test/model",
      promptVersion: "test-v1",
    });

    await expect(pruneExpiredUnreferencedItems(env.DB, CUTOFF)).resolves.toBe(1);
    const rows = await env.DB.prepare("SELECT id FROM ingested_items ORDER BY id").all<{ id: number }>();
    expect(rows.results.map((row) => row.id)).toEqual(
      [boundaryId, recentId, publishedId, linkedId].sort((left, right) => left - right),
    );
    expect(rows.results.some((row) => row.id === eligibleId)).toBe(false);
  });

  it("deletes only the oldest rows up to the supplied limit", async () => {
    const oldestId = await insertItem(sourceId, "oldest", "2026-01-01T00:00:00.000Z", "failed");
    const middleId = await insertItem(sourceId, "middle", "2026-02-01T00:00:00.000Z", "rejected");
    const newestId = await insertItem(sourceId, "newest", "2026-03-01T00:00:00.000Z", "selected");

    await expect(pruneExpiredUnreferencedItems(env.DB, CUTOFF, 2)).resolves.toBe(2);
    const rows = await env.DB.prepare("SELECT id FROM ingested_items ORDER BY id").all<{ id: number }>();
    expect(rows.results.map((row) => row.id)).toEqual([newestId]);
    expect(rows.results.some((row) => row.id === oldestId || row.id === middleId)).toBe(false);
  });

  it("caps each cleanup at 500 rows", async () => {
    await env.DB.batch(
      Array.from({ length: 501 }, (_, index) =>
        env.DB.prepare(
          `INSERT INTO ingested_items
            (source_id, guid, canonical_url, title, source_excerpt, published_at, discovered_at, title_hash, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed')`,
        ).bind(
          sourceId,
          `bulk-${index}`,
          `https://example.com/bulk-${index}`,
          `Bulk story ${index}`,
          "Excerpt",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z",
          `bulk-hash-${index}`,
        ),
      ),
    );

    await expect(pruneExpiredUnreferencedItems(env.DB, CUTOFF, 999)).resolves.toBe(500);
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM ingested_items").first<{ count: number }>())
      .resolves.toMatchObject({ count: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```bash
npm test -- --run tests/worker/retention.test.ts
```

Expected: FAIL because `pruneExpiredUnreferencedItems` is not exported.

- [ ] **Step 3: Implement the repository function**

Add to `src/db/repositories/items.ts`:

```ts
const MAX_RETENTION_DELETE_ITEMS = 500;

export async function pruneExpiredUnreferencedItems(
  db: D1Database,
  cutoff: string,
  limit = MAX_RETENTION_DELETE_ITEMS,
): Promise<number> {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 0), MAX_RETENTION_DELETE_ITEMS);
  if (boundedLimit === 0) return 0;

  const result = await db.prepare(
    `DELETE FROM ingested_items
     WHERE id IN (
       SELECT i.id
       FROM ingested_items i
       WHERE i.discovered_at < ?
         AND i.status IN ('new', 'selected', 'failed', 'rejected')
         AND NOT EXISTS (
           SELECT 1 FROM stories s WHERE s.ingested_item_id = i.id
         )
       ORDER BY i.discovered_at ASC, i.id ASC
       LIMIT ?
     )`,
  ).bind(cutoff, boundedLimit).run();

  return Number(result.meta.changes ?? 0);
}
```

- [ ] **Step 4: Run repository tests to verify GREEN**

Run:

```bash
npm test -- --run tests/worker/retention.test.ts tests/worker/items.test.ts tests/worker/repositories.test.ts
```

Expected: all selected test files pass.

- [ ] **Step 5: Commit the repository unit**

```bash
git add src/db/repositories/items.ts tests/worker/retention.test.ts
git commit -m "feat: add bounded ingestion retention"
```

Expected: one commit containing the repository function and its focused tests.

---

### Task 2: Integrate retention into the live pipeline

**Files:**
- Modify: `src/pipeline/runDailyPipeline.ts`
- Modify: `tests/worker/pipeline.test.ts`

**Interfaces:**
- Consumes: `pruneExpiredUnreferencedItems(db, cutoff, limit?)` from Task 1 and the existing injected `PipelineOptions.now`.
- Produces: live pipeline cleanup, a test-only `retentionPruner` dependency override, and non-fatal cleanup error reporting.

- [ ] **Step 1: Write failing live, dry-run, cutoff, and failure tests**

Extend `tests/worker/pipeline.test.ts` with a helper that inserts an old unreferenced `failed` item. Add these behaviors:

```ts
async function insertStaleItem(sourceId: number, key: string): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO ingested_items
      (source_id, guid, canonical_url, title, source_excerpt, published_at, discovered_at, title_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed')`,
  ).bind(
    sourceId,
    key,
    `https://stale.example/${key}`,
    `Stale ${key}`,
    "Old excerpt",
    "2026-03-01T00:00:00.000Z",
    "2026-03-01T00:00:00.000Z",
    `stale-${key}`,
  ).run();
  return Number(result.meta.last_row_id);
}

it("prunes stale unreferenced ingestion rows during a live run", async () => {
  const sourceId = await createSource(env.DB, {
    name: "Source 1",
    publisherUrl: "https://publisher.example",
    feedUrl: "https://feeds.example/source-1.xml",
    defaultCategory: "模型與研究",
    language: "en",
  });
  const staleId = await insertStaleItem(sourceId, "live");
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
    return new Response(feedXml(1));
  });

  const result = await runDailyPipeline(testEnv(aiForPipeline()), {
    date: "2026-07-17",
    now: new Date("2026-07-17T06:00:00.000Z"),
    fetcher,
  });

  expect(result.storiesPublished).toBe(1);
  await expect(env.DB.prepare("SELECT id FROM ingested_items WHERE id = ?").bind(staleId).first())
    .resolves.toBeNull();
});

it("does not prune ingestion rows during a dry run", async () => {
  const sourceId = await createSource(env.DB, {
    name: "Source 1",
    publisherUrl: "https://publisher.example",
    feedUrl: "https://feeds.example/source-1.xml",
    defaultCategory: "模型與研究",
    language: "en",
  });
  const staleId = await insertStaleItem(sourceId, "dry");
  const retentionPruner = vi.fn(async () => 1);
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
    return new Response(feedXml(1));
  });

  await runDailyPipeline(testEnv(aiForPipeline()), {
    date: "2026-07-17",
    now: new Date("2026-07-17T06:00:00.000Z"),
    dryRun: true,
    fetcher,
    retentionPruner,
  });

  expect(retentionPruner).not.toHaveBeenCalled();
  await expect(env.DB.prepare("SELECT id FROM ingested_items WHERE id = ?").bind(staleId).first())
    .resolves.toMatchObject({ id: staleId });
});

it("continues publishing when retention cleanup fails", async () => {
  const retentionPruner = vi.fn().mockRejectedValue(new Error("maintenance unavailable"));
  await createSource(env.DB, {
    name: "Source 1",
    publisherUrl: "https://publisher.example",
    feedUrl: "https://feeds.example/source-1.xml",
    defaultCategory: "模型與研究",
    language: "en",
  });
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
    return new Response(feedXml(1, 3));
  });

  const result = await runDailyPipeline(testEnv(aiForPipeline()), {
    date: "2026-07-17",
    now: new Date("2026-07-17T06:00:00.000Z"),
    fetcher,
    retentionPruner,
  });

  expect(result.storiesPublished).toBe(3);
  expect(result.digestId).not.toBeNull();
  expect(result.status).toBe("partial");
  expect(result.errors).toContain("Retention cleanup: maintenance unavailable");
  expect(retentionPruner).toHaveBeenCalledWith(env.DB, "2026-04-18T06:00:00.000Z");
});
```

- [ ] **Step 2: Run pipeline tests to verify RED**

Run:

```bash
npm test -- --run tests/worker/pipeline.test.ts
```

Expected: FAIL because `PipelineOptions` has no `retentionPruner` and the live path does not prune.

- [ ] **Step 3: Add retention constants, dependency type, and cutoff calculation**

In `src/pipeline/runDailyPipeline.ts`, import the repository function and add:

```ts
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

function retentionCutoffFor(now: Date): string {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString();
}
```

- [ ] **Step 4: Invoke cleanup only in the live path**

Immediately after `runId = await startRun(env.DB, date);`, add:

```ts
try {
  const pruneItems = options.retentionPruner ?? pruneExpiredUnreferencedItems;
  await pruneItems(env.DB, retentionCutoffFor(now));
} catch (error) {
  result.errors.push(`Retention cleanup: ${errorMessage(error)}`);
}
```

Do not add cleanup to `runDryPipeline`.

- [ ] **Step 5: Run pipeline and retention tests to verify GREEN**

Run:

```bash
npm test -- --run tests/worker/pipeline.test.ts tests/worker/retention.test.ts
```

Expected: both test files pass, including live cleanup, dry-run no mutation, exact cutoff, and non-fatal failure isolation.

- [ ] **Step 6: Commit the pipeline integration**

```bash
git add src/pipeline/runDailyPipeline.ts tests/worker/pipeline.test.ts
git commit -m "feat: run retention cleanup in daily pipeline"
```

Expected: one commit containing pipeline wiring and integration tests.

---

### Task 3: Document, verify, deploy, and observe the policy

**Files:**
- Modify: `README.md`
- Modify: `docs/operations.md`
- Verify: `wrangler.jsonc`
- Verify: all `src/` and `tests/worker/`

**Interfaces:**
- Consumes: The 90-day, 500-row behavior implemented in Tasks 1 and 2.
- Produces: Operator-visible retention guidance and a deployed Worker that will prune through its next live pipeline run.

- [ ] **Step 1: Document retention behavior**

In the README daily-flow section, state that each live run removes at most 500 unreferenced, non-published ingestion rows strictly older than 90 days. In `docs/operations.md`, add a retention subsection that states no published story or digest is deleted and provides this read-only monitoring query:

```bash
npx wrangler d1 execute ainews --remote --command="SELECT COUNT(*) AS stale_unreferenced_items FROM ingested_items i WHERE i.discovered_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days') AND i.status IN ('new', 'selected', 'failed', 'rejected') AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.ingested_item_id = i.id);"
```

- [ ] **Step 2: Run the complete verification gate**

Run:

```bash
npm run typecheck
npm test -- --reporter=dot
npm run build
git diff --check
```

Expected: TypeScript exits 0; all Vitest files and tests pass with zero failures; Wrangler dry-run exits 0; `git diff --check` prints nothing.

- [ ] **Step 3: Scan the final diff for forbidden scope**

Run:

```bash
git status --short
git diff -- README.md docs/operations.md src/db/repositories/items.ts src/pipeline/runDailyPipeline.ts tests/worker/retention.test.ts tests/worker/pipeline.test.ts
git diff --name-only HEAD~2
```

Expected: no migration, Cron, binding, model, secret, or unrelated application file changed.

- [ ] **Step 4: Commit operator documentation**

```bash
git add README.md docs/operations.md
git commit -m "docs: document d1 retention policy"
```

Expected: one documentation-only commit.

- [ ] **Step 5: Deploy the verified Worker**

Run with the existing Cloudflare credentials without printing them:

```bash
npm run deploy
```

Expected: Wrangler deploys `ainews-hk`, keeps `schedule: 0 6 * * *`, and reports the existing D1 and Workers AI bindings. Do not run ad-hoc deletion SQL and do not create an admin token for deployment.

- [ ] **Step 6: Verify production without triggering cleanup manually**

Run:

```bash
curl -fsS https://ainews.cchk.uk/health
curl -fsS -o /dev/null -w "HOME %{http_code}\n" https://ainews.cchk.uk/
curl -fsS -o /dev/null -w "DIGEST %{http_code}\n" https://ainews.cchk.uk/digest/latest
curl -fsS -o /dev/null -w "RSS %{http_code}\n" https://ainews.cchk.uk/rss.xml
curl -fsS -o /dev/null -w "SITEMAP %{http_code}\n" https://ainews.cchk.uk/sitemap.xml
```

Expected: health reports D1 `ok`; all public endpoints return HTTP 200. Report that cleanup becomes active on the next scheduled or explicitly authorized live pipeline run rather than claiming production rows were already pruned.
