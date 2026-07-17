# AI News Hong Kong Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a single Cloudflare Worker that collects global AI news, publishes zh-HK story pages and daily digests, stores content in D1, and uses Workers AI for neutral factual summaries.

**Architecture:** A TypeScript Worker serves server-rendered HTML, RSS, sitemap, search, and health routes. The same Worker handles a daily Cron Trigger, fetching allowlisted RSS/Atom feeds plus GDELT DOC 2.0 candidates, deduplicating items, calling Workers AI, and writing idempotent results to D1.

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, Wrangler, D1, Workers AI, fast-xml-parser, Vitest, @cloudflare/vitest-pool-workers, Hono JSX templates, plain CSS, and minimal vanilla JavaScript.

## Global Constraints

- Site URL: `https://ainews.cchk.uk`.
- Generated editorial language: Hong Kong Traditional Chinese, `zh-HK`.
- Editorial tone: neutral and factual.
- Categories: `模型與研究`, `產品與公司`, `開源與開發者`, `政策與安全`, `投資與產業`.
- First release source budget: 15–20 enabled feeds and approximately 8–12 AI-selected stories per daily run.
- Default Cron schedule: `0 6 * * *`, 06:00 UTC, 14:00 HKT.
- Do not store or republish full source articles. Store only metadata and bounded excerpts needed for processing.
- Every published story must display its publisher, source URL, source publication time when available, and the AI disclosure.
- Workers AI output must be validated structured data before D1 publication.
- The daily run must be idempotent by UTC date and canonical source URL.
- The GitHub PAT is repository-only. Cloudflare credentials and the admin token are secrets, never committed or sent to the browser.
- No user accounts, comments, opinions, social publishing, email delivery, or full admin dashboard in the first release.

---

### Task 1: Bootstrap the Cloudflare Worker project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.jsonc`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/index.ts`
- Create: `src/env.ts`
- Test: `tests/worker/health.test.ts`

**Interfaces:**
- `Env` exports `DB: D1Database`, `AI: Ai`, `ADMIN_TOKEN: string`, and optional `ASSETS: Fetcher`.
- The Worker default export implements `fetch(request, env, ctx)` and `scheduled(controller, env, ctx)`.
- `GET /health` returns JSON with `ok`, `database`, and `lastRun` fields without secrets.

- [ ] **Step 1: Write the failing health test**

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('health route', () => {
  it('returns a JSON health response', async () => {
    const response = await SELF.fetch('https://ainews.cchk.uk/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/worker/health.test.ts`

Expected: FAIL because the project files and Worker route do not exist.

- [ ] **Step 3: Create the package and Worker configuration**

Add scripts named `dev`, `build`, `test`, `typecheck`, `db:migrate:local`, and `deploy`. Configure Wrangler with the Worker entrypoint, D1 binding `DB`, Workers AI binding `AI`, the `ADMIN_TOKEN` secret binding, the `0 6 * * *` Cron Trigger, and static assets from `public`.

- [ ] **Step 4: Implement the minimum Worker and health route**

The health handler queries D1 with `SELECT 1 AS ok` and returns `lastRun: null` until the pipeline table exists.

- [ ] **Step 5: Run the focused test and typecheck**

Run: `npm test -- tests/worker/health.test.ts` and `npm run typecheck`.

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json wrangler.jsonc vitest.config.ts .gitignore src tests
git commit -m "chore: bootstrap cloudflare worker"
```

### Task 2: Add the D1 schema, migration, and typed repositories

**Files:**
- Create: `migrations/0001_initial.sql`
- Create: `src/db/types.ts`
- Create: `src/db/repositories/sources.ts`
- Create: `src/db/repositories/items.ts`
- Create: `src/db/repositories/stories.ts`
- Create: `src/db/repositories/digests.ts`
- Create: `src/db/repositories/runs.ts`
- Test: `tests/worker/schema.test.ts`
- Test: `tests/worker/repositories.test.ts`

**Interfaces:**
- `getEnabledSources(db): Promise<SourceRecord[]>`.
- `upsertIngestedItem(db, item): Promise<{ id: number; inserted: boolean }>`.
- `createStory(db, story): Promise<number>`.
- `getPublishedStoriesForDigest(db, date): Promise<StoryRecord[]>`.
- `upsertDigest(db, digest): Promise<number>`.
- `startRun(db, runKey): Promise<number>` and `finishRun(db, runId, result): Promise<void>`.

- [ ] **Step 1: Write schema invariant tests**

Test the six tables, unique feed URLs, unique canonical item URLs, unique story slugs, unique digest dates, composite digest-story keys, and required indexes.

- [ ] **Step 2: Run schema tests to verify failure**

Run: `npm test -- tests/worker/schema.test.ts`.

Expected: FAIL because the migration is not applied.

- [ ] **Step 3: Write the D1 migration**

Create `sources`, `ingested_items`, `stories`, `digests`, `digest_stories`, and `pipeline_runs` with the columns, statuses, foreign keys, unique constraints, and indexes from the approved design specification.

- [ ] **Step 4: Implement typed repositories**

Use bound parameters. Keep JSON serialization and parsing inside repository boundaries. Return typed arrays and objects to callers.

- [ ] **Step 5: Run migration and repository tests**

Run `npm run db:migrate:local`, then `npm test -- tests/worker/schema.test.ts tests/worker/repositories.test.ts`.

Expected: migration and tests PASS.

- [ ] **Step 6: Commit**

```bash
git add migrations src/db tests/worker
git commit -m "feat: add d1 schema and repositories"
```

### Task 3: Implement feed parsing, normalization, and deduplication

**Files:**
- Create: `src/feeds/types.ts`
- Create: `src/feeds/parseFeed.ts`
- Create: `src/feeds/normalizeUrl.ts`
- Create: `src/feeds/titleFingerprint.ts`
- Create: `src/feeds/collectFeeds.ts`
- Create: `src/feeds/gdelt.ts`
- Test: `tests/worker/feed-parser.test.ts`
- Test: `tests/worker/normalization.test.ts`
- Test: `tests/worker/collection.test.ts`

**Interfaces:**
- `parseFeed(xml: string, source: SourceRecord): FeedItem[]`.
- `normalizeUrl(input: string): string`.
- `titleFingerprint(title: string): string`.
- `collectFromFeeds(sources, fetcher): Promise<CollectionResult>`.
- `collectFromGdelt(query, fetcher): Promise<FeedItem[]>`.

- [ ] **Step 1: Add RSS and Atom fixtures and failing tests**

Cover RSS 2.0, Atom alternate links, missing descriptions, malformed dates, HTML entities, tracking parameters, and duplicate items.

- [ ] **Step 2: Run focused parser tests**

Run: `npm test -- tests/worker/feed-parser.test.ts tests/worker/normalization.test.ts`.

Expected: FAIL because parser and normalization functions are absent.

- [ ] **Step 3: Implement bounded XML parsing**

Use `fast-xml-parser` with entity processing and a maximum input length. Support RSS `channel.item` and Atom `entry`. Truncate excerpts before D1 writes or AI calls.

- [ ] **Step 4: Implement deterministic normalization**

Remove fragments and common tracking parameters, normalize host casing and trailing slashes, collapse whitespace, remove punctuation for title fingerprints, and use exact URL or title-fingerprint matches for duplicates.

- [ ] **Step 5: Implement bounded collection**

Fetch enabled feeds in batches of five with timeouts. Use `Promise.allSettled` so one feed failure does not abort the batch. Query GDELT once per run with an AI query and a 24-hour window. Do not fetch arbitrary article pages in this task.

- [ ] **Step 6: Run collection tests and commit**

Run: `npm test -- tests/worker/feed-parser.test.ts tests/worker/normalization.test.ts tests/worker/collection.test.ts`.

Expected: PASS, including failed-feed isolation.

```bash
git add src/feeds tests/worker package.json package-lock.json
git commit -m "feat: collect and normalize ai news feeds"
```

### Task 4: Add Workers AI contracts and validated zh-HK summaries

**Files:**
- Create: `src/ai/contracts.ts`
- Create: `src/ai/validateOutput.ts`
- Create: `src/ai/summarizeStory.ts`
- Create: `src/ai/createDigest.ts`
- Create: `src/ai/prompts.ts`
- Test: `tests/worker/ai-validation.test.ts`
- Test: `tests/worker/ai-service.test.ts`

**Interfaces:**
- `validateStoryOutput(value: unknown): StoryAiOutput`.
- `validateDigestOutput(value: unknown, allowedStoryIds: number[]): DigestAiOutput`.
- `summarizeStory(ai, input): Promise<StoryAiOutput>`.
- `createDigest(ai, stories): Promise<DigestAiOutput>`.
- Store `AI_MODEL_ID` and `PROMPT_VERSION` on every published row.

- [ ] **Step 1: Write failing validation tests**

Test valid output, missing headline, non-array key facts, unknown category, overlong fields, invalid digest story IDs, and malformed model JSON.

- [ ] **Step 2: Run validation tests**

Run: `npm test -- tests/worker/ai-validation.test.ts`.

Expected: FAIL because validators do not exist.

- [ ] **Step 3: Implement strict validators**

Validate plain objects, required strings, the five categories, exactly three story key facts, bounded arrays, digest IDs belonging to the input set, and absence of HTML tags in generated fields.

- [ ] **Step 4: Implement prompts and AI calls**

Send only source name, title, publication date, bounded excerpt, and canonical URL to the story summarizer. Require zh-HK, neutral factual style, no unsupported claims, no invented quotations or numbers, and JSON-only output. Send only validated story summaries to the digest generator.

- [ ] **Step 5: Run mocked AI tests and commit**

Mock `env.AI.run` for valid JSON, invalid JSON, and rejected promises.

Run: `npm test -- tests/worker/ai-validation.test.ts tests/worker/ai-service.test.ts`.

Expected: PASS.

```bash
git add src/ai tests/worker/ai-validation.test.ts tests/worker/ai-service.test.ts
git commit -m "feat: add validated zh-hk ai summaries"
```

### Task 5: Build the idempotent daily pipeline and scheduled handler

**Files:**
- Create: `src/pipeline/selectCandidates.ts`
- Create: `src/pipeline/processStory.ts`
- Create: `src/pipeline/runDailyPipeline.ts`
- Create: `src/routes/admin.ts`
- Modify: `src/index.ts`
- Modify: `src/routes/health.ts`
- Test: `tests/worker/pipeline.test.ts`
- Test: `tests/worker/scheduled.test.ts`
- Test: `tests/worker/admin.test.ts`

**Interfaces:**
- `runDailyPipeline(env, options): Promise<PipelineResult>`.
- `selectCandidates(items, limit = 12): FeedItem[]`.
- `processStory(env, item): Promise<PublishedStory | FailedStory>`.
- `POST /admin/run` accepts `{ date?: string; dryRun?: boolean }` with a bearer token.

- [ ] **Step 1: Write failure-isolation and idempotency tests**

Cover successful stories, failed feeds, failed AI calls, fewer than three valid stories, duplicate reruns, dry runs, and a second execution for one UTC date.

- [ ] **Step 2: Run focused pipeline tests**

Run: `npm test -- tests/worker/pipeline.test.ts tests/worker/scheduled.test.ts tests/worker/admin.test.ts`.

Expected: FAIL because the orchestrator and routes are absent.

- [ ] **Step 3: Implement deterministic selection**

Load recent `new` items, remove URL and exact title-fingerprint duplicates, balance categories, order by source priority and publication time, cap at 12, and mark selected items.

- [ ] **Step 4: Implement story processing**

Call the AI service, validate output, create a Traditional Chinese-safe slug with a collision suffix, insert the story, and record bounded errors without aborting other items.

- [ ] **Step 5: Implement digest creation**

Use validated stories only. For three or more stories, call and validate Workers AI. For one or two stories, write a deterministic partial digest with a data-availability notice. For zero stories, record a failed or empty run without fabricating content.

- [ ] **Step 6: Implement Cron and protected manual execution**

Derive the UTC date from `controller.scheduledTime`. Reject non-POST requests, missing or mismatched bearer tokens, invalid dates, and malformed JSON. Dry runs do not write published stories or digests.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- tests/worker/pipeline.test.ts tests/worker/scheduled.test.ts tests/worker/admin.test.ts`.

Expected: PASS, including no duplicate rows after a rerun.

```bash
git add src/pipeline src/routes src/index.ts tests/worker
git commit -m "feat: add daily news publishing pipeline"
```

### Task 6: Implement public routes, HTML rendering, and visual system

**Files:**
- Create: `src/routes/public.ts`
- Create: `src/render/layout.tsx`
- Create: `src/render/components.tsx`
- Create: `src/render/pages/home.tsx`
- Create: `src/render/pages/digest.tsx`
- Create: `src/render/pages/story.tsx`
- Create: `src/render/pages/category.tsx`
- Create: `src/render/pages/search.tsx`
- Create: `public/styles.css`
- Create: `public/client.js`
- Test: `tests/worker/routes.test.ts`
- Test: `tests/worker/rendering.test.ts`

**Interfaces:**
- HTML routes: `/`, `/digest/:date`, `/story/:slug`, `/category/:category`, and `/search?q=...`.
- `renderLayout(props): string` provides `lang="zh-HK"`, metadata, navigation, and footer.
- Public queries return published records only and have explicit result limits.

- [ ] **Step 1: Write route and rendering tests**

Verify homepage content, source links, digest links, category filtering, empty search results, 404 responses, canonical URLs, language metadata, and the AI disclosure.

- [ ] **Step 2: Run focused route tests**

Run: `npm test -- tests/worker/routes.test.ts tests/worker/rendering.test.ts`.

Expected: FAIL because public routes and templates are absent.

- [ ] **Step 3: Implement bounded public queries**

Add queries for the latest digest, latest stories, digest by date, story by slug, category archive, and case-insensitive D1 `LIKE` search over headline, summary, and source name, capped at 50 results.

- [ ] **Step 4: Implement the editorial shell**

Render warm paper-toned light colors, near-black tinted ink, one cinnabar accent, Traditional Chinese serif display type, clean sans-serif controls, whitespace, thin separators, no repeated card grid, and mobile-first line height. Escape all text, attributes, and URLs.

- [ ] **Step 5: Implement page types**

The homepage leads with today’s digest. The digest groups linked stories by category. The story page shows headline, source metadata, summary, three key facts, related stories, original link, and AI disclosure. Category and search pages provide bounded archives and empty states.

- [ ] **Step 6: Run route tests and commit**

Run: `npm test -- tests/worker/routes.test.ts tests/worker/rendering.test.ts`.

Expected: PASS.

```bash
git add src/routes/public.ts src/render public tests/worker
git commit -m "feat: add zh-hk editorial blog"
```

### Task 7: Add RSS, sitemap, metadata, and accessibility verification

**Files:**
- Create: `src/routes/feeds.ts`
- Create: `src/render/metadata.ts`
- Modify: `src/index.ts`
- Test: `tests/worker/feeds.test.ts`
- Test: `tests/worker/metadata.test.ts`

**Interfaces:**
- `GET /rss.xml` returns valid RSS 2.0 with the newest published stories.
- `GET /sitemap.xml` returns published story and digest URLs.
- Every HTML page includes canonical URL, Open Graph metadata, publication metadata where applicable, and Article JSON-LD for stories.

- [ ] **Step 1: Write failing feed and metadata tests**

Validate content types, XML roots, escaped titles, canonical URLs, sitemap URL count, JSON-LD fields, and absence of secrets in serialized HTML.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/worker/feeds.test.ts tests/worker/metadata.test.ts`.

Expected: FAIL because feed and metadata routes are absent.

- [ ] **Step 3: Implement XML serializers**

Escape every source-derived XML value. Include site title, story URL, Chinese headline, short summary, and publication date in RSS. Include only published URLs in the sitemap.

- [ ] **Step 4: Implement metadata and structured data**

Use `zh-HK` locale metadata, absolute URLs under `ainews.cchk.uk`, safe descriptions, and Article JSON-LD with publisher and date where available.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- tests/worker/feeds.test.ts tests/worker/metadata.test.ts`.

Expected: PASS.

```bash
git add src/routes/feeds.ts src/render/metadata.ts src/index.ts tests/worker
git commit -m "feat: add rss sitemap and article metadata"
```

### Task 8: Configure deployment, operations, and first live verification

**Files:**
- Create: `README.md`
- Create: `.github/workflows/deploy.yml`
- Create: `docs/operations.md`
- Modify: `wrangler.jsonc`
- Modify: `.gitignore`
- Test: `tests/worker/deployment-config.test.ts`

**Interfaces:**
- `npm run dev` starts the Worker with local D1 and assets.
- `npm run db:migrate:local` applies migrations locally.
- `npm run deploy` deploys with Wrangler using GitHub Actions secrets.
- GitHub Actions uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, never `GITHUB_PAT` at runtime.

- [ ] **Step 1: Write deployment configuration tests**

Verify Worker name, D1 binding, AI binding, Cron schedule, asset directory, and absence of shell-profile reads or literal tokens in the workflow.

- [ ] **Step 2: Run configuration tests**

Run: `npm test -- tests/worker/deployment-config.test.ts`.

Expected: FAIL until configuration and workflow files exist.

- [ ] **Step 3: Configure local, preview, and production environments**

Keep production database IDs and secrets out of committed files. Document the exact D1 creation, secret setup, and custom-domain commands in `docs/operations.md`.

- [ ] **Step 4: Add the GitHub Actions workflow**

Trigger on pushes to `main`. Install dependencies, run typecheck and tests, and deploy with Cloudflare secrets. Do not add the GitHub PAT to the Worker or workflow runtime.

- [ ] **Step 5: Document operations**

Document source onboarding, source disabling, local scheduled testing, dry runs, manual execution, inspecting `pipeline_runs`, Workers AI usage, admin-token rotation, and attaching `ainews.cchk.uk`.

- [ ] **Step 6: Run the configuration test and commit**

Run: `npm test -- tests/worker/deployment-config.test.ts`.

Expected: PASS.

```bash
git add README.md .github/workflows/deploy.yml docs/operations.md wrangler.jsonc .gitignore tests/worker
git commit -m "chore: add cloudflare deployment workflow"
```

### Task 9: Full verification and handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/operations.md`
- Test: all files under `tests/worker`

- [ ] **Step 1: Run complete local verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all tests pass, typecheck passes, and Wrangler builds the Worker bundle.

- [ ] **Step 2: Test the scheduled handler locally**

Start `npm run dev`, call Wrangler’s scheduled test endpoint, and verify D1 records, mocked AI output, digest creation, and partial-failure logging.

- [ ] **Step 3: Verify the public route matrix**

Request `/`, `/digest/YYYY-MM-DD`, `/story/example`, `/category/模型與研究`, `/search?q=模型`, `/rss.xml`, `/sitemap.xml`, and `/health`. Confirm expected status, content type, language metadata, and no secrets.

- [ ] **Step 4: Run a preview dry run**

Deploy a preview Worker, call `POST /admin/run` with `dryRun: true`, inspect the run record, and confirm no published story or digest was written.

- [ ] **Step 5: Attach the domain and run the first live job**

Attach `ainews.cchk.uk` after preview verification. Run one controlled production job, inspect D1 records and Workers AI usage, then verify homepage, stories, RSS, sitemap, and Cron execution.

- [ ] **Step 6: Commit the verified state**

```bash
git add .
git commit -m "feat: launch ai news hong kong blog"
```

## Self-review checklist

- The plan covers source collection, deduplication, AI validation, D1 persistence, digest generation, public pages, SEO feeds, operations, deployment, and verification.
- Every task names concrete files, interfaces, tests, commands, expected results, and a commit boundary.
- The plan uses the approved categories, route paths, language, schedule, source cap, story cap, and security rules.
- No task requires full article storage, unsupported AI claims, a user account system, or a paid news API.
- Reruns, partial failures, invalid AI output, feed outages, and missing excerpts have explicit behavior.
- The implementation order leaves a testable Worker after each major task.
