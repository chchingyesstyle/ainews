# D1 90-day retention policy design

## Objective

Prevent unbounded growth of temporary ingestion data while preserving all published editorial content. The scheduled and live manual pipeline will remove stale, unreferenced ingestion rows older than 90 days without changing stories, digests, sources, or their relationships.

## Retention scope

The policy applies only to rows in `ingested_items` that satisfy every condition below:

- `discovered_at` is strictly earlier than the UTC cutoff of `pipeline now - 90 days`;
- `status` is one of `new`, `selected`, `failed`, or `rejected`;
- no row in `stories` references the ingestion row through `stories.ingested_item_id`.

Rows at exactly the cutoff remain until a later run. Rows with status `published` remain even if an unexpected inconsistency leaves them without a story reference. All stories, digests, digest-story relationships, sources, and pipeline-run records remain outside this 90-day policy.

## Architecture

Add a focused repository function in `src/db/repositories/items.ts`:

```ts
pruneExpiredUnreferencedItems(
  db: D1Database,
  cutoff: string,
  limit?: number,
): Promise<number>
```

The default limit is 500 rows per invocation. The SQL selects the oldest eligible IDs by `discovered_at` and `id`, excludes IDs referenced by `stories`, applies the limit, deletes only those IDs, and returns the number of rows deleted from D1 metadata.

The live `runDailyPipeline` path computes its cutoff from the existing `now` value and invokes cleanup after `startRun` but before feed collection. Running cleanup before collection allows an old, unreferenced canonical URL to be rediscovered and considered as a fresh item during the same daily run.

The dry-run path never invokes the cleanup repository function and therefore remains free of database mutations.

## Bounded operation

Each cleanup deletes at most 500 rows. The ingestion path accepts at most 200 discovered items per run, so a successful daily cleanup can reduce an existing backlog while remaining bounded below D1 query and write limits. No new Cron trigger, configuration variable, schema column, or migration is required.

The retention duration and default batch limit are named constants in the pipeline/repository code rather than environment variables. This keeps the first policy explicit and testable without adding configuration that is not currently needed.

## Failure handling

Retention is maintenance, not a prerequisite for publishing news. If cleanup fails:

- the error is converted to the existing bounded pipeline error format;
- the message is prefixed with `Retention cleanup:`;
- feed collection, story processing, digest generation, and run finalization continue;
- the run becomes `partial` when otherwise publishable content exists, because `result.errors` is non-empty.

If `startRun` itself fails, cleanup is not attempted because no run can be safely recorded.

## Tests

Repository regression tests will prove that cleanup:

- removes an eligible unreferenced row older than 90 days;
- retains a row exactly at the cutoff;
- retains a recent row;
- retains an old row referenced by a story;
- retains an unreferenced row with status `published`;
- deletes no more than the supplied batch limit and chooses the oldest eligible rows first;
- returns the D1 deletion count.

Pipeline regression tests will prove that:

- a live run prunes eligible stale data using its injected `now` value;
- a dry run leaves the same stale row untouched;
- news publication remains idempotent after cleanup integration.

The complete TypeScript typecheck, Vitest suite, and Wrangler dry-run build must pass before deployment.

## Production rollout

The change requires a normal Worker deployment but no D1 migration. Deployment must not manually delete production rows. The first scheduled or explicitly authorized live pipeline run performs the bounded cleanup through the tested application path.

After rollout, verify the Worker health endpoint, latest pipeline status, published story/digest availability, and the count of stale unreferenced ingestion rows. Any live manual run continues to require the existing admin authorization workflow; scheduled cleanup does not require an admin token.
