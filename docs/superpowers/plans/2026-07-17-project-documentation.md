# Project Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the repository entry-point documentation so users, operators, contributors, and coding agents can understand and safely work with the deployed AI News Hong Kong application.

**Architecture:** Keep three documentation layers with distinct responsibilities. `README.md` is the concise public overview and onboarding guide, `AGENTS.md` is the actionable repository contract for contributors and agents, and `docs/operations.md` remains the canonical detailed production runbook.

**Tech Stack:** Markdown, Node.js 22+, npm, TypeScript, Hono, Cloudflare Workers, Workers AI, D1, Wrangler, Vitest

## Global Constraints

- Both root documents use concise Hong Kong Traditional Chinese, retaining English technical identifiers where they improve precision.
- Commands must match `package.json`; deployment values must match `wrangler.jsonc`.
- The deployed site is `https://ainews.cchk.uk`, content is stored in D1, and Cron runs at `0 6 * * *` (UTC 06:00 / Hong Kong 14:00).
- Examples may reference environment variables but must never include a real PAT, Cloudflare API token, admin token, `.dev.vars` value, or credential from a shell startup file.
- This plan changes documentation only; it must not mutate application behavior, schema, Cloudflare bindings, secrets, or production data.

---

### Task 1: Refresh the public README

**Files:**
- Modify: `README.md`
- Reference: `package.json`
- Reference: `wrangler.jsonc`
- Reference: `docs/operations.md`

**Interfaces:**
- Consumes: Current npm scripts, Worker bindings, public routes, Cron expression, and operations-guide path.
- Produces: A public project overview that `AGENTS.md` can reference for product and setup context.

- [ ] **Step 1: Replace stale deployment copy with the live project overview**

Use the title `# AI 新聞．香港`, link the live site, and state that the application is deployed on Cloudflare Workers. Describe the stack as Workers AI for zh-HK summarization, D1 for sources/items/stories/digests/run records, Cron for daily execution, and Worker-rendered HTML/RSS/sitemap/health routes. Remove all copy saying the D1 ID, sources, secrets, or production deployment are still pending.

- [ ] **Step 2: Document the daily data flow**

Add a short ordered section covering these exact stages:

1. Read enabled RSS/Atom sources from D1 and use GDELT only as supplemental discovery.
2. Normalize and bound discovered items, then deduplicate and select candidates.
3. Ask Workers AI for neutral, source-grounded Hong Kong Traditional Chinese story summaries.
4. Validate every AI field before publication and isolate per-story failures.
5. Build the daily digest; if digest AI output is invalid, publish a deterministic partial digest from validated story data.
6. Store results and bounded errors in D1 and serve the public pages from the Worker.

- [ ] **Step 3: Add accurate setup, verification, and deployment commands**

Include these commands exactly:

```bash
npm install
npm run db:migrate:local
npm run dev

npm run typecheck
npm test
npm run build

npx wrangler d1 migrations apply DB --remote
npm run deploy
```

Explain that `npm run build` is a dry-run and that production details live in [`docs/operations.md`](docs/operations.md). State that the current schedule is UTC 06:00 / Hong Kong 14:00.

- [ ] **Step 4: Retain route, editorial, copyright, and security guidance**

List `/`, `/digest/latest`, `/digest/YYYY-MM-DD`, `/story/:slug`, `/category/:category`, `/search?q=...`, `/rss.xml`, `/sitemap.xml`, `/health`, and protected `POST /admin/run`. State that the site retains bounded source metadata/excerpts and links to the original rather than copying full articles. Require neutral, factual zh-HK summaries and the AI disclosure. Explicitly prohibit committing GitHub PATs, Cloudflare API tokens, `ADMIN_TOKEN`, `.env`, or `.dev.vars`.

- [ ] **Step 5: Verify README references and formatting**

Run:

```bash
for path in package.json wrangler.jsonc docs/operations.md; do test -f "$path" || exit 1; done
for script in dev build test typecheck db:migrate:local deploy; do node -e 'const p=require("./package.json"); process.exit(p.scripts[process.argv[1]] ? 0 : 1)' "$script" || exit 1; done
git diff --check -- README.md
```

Expected: every command exits 0 and `git diff --check` prints nothing.

- [ ] **Step 6: Commit the README update**

```bash
git add README.md
git commit -m "docs: refresh project readme"
```

Expected: one commit containing only `README.md`.

---

### Task 2: Add contributor and agent guidance

**Files:**
- Create: `AGENTS.md`
- Reference: `README.md`
- Reference: `docs/operations.md`
- Reference: `src/`
- Reference: `tests/worker/`
- Reference: `migrations/`

**Interfaces:**
- Consumes: The product/setup overview in `README.md` and production procedures in `docs/operations.md`.
- Produces: Root-scoped instructions that coding agents and contributors can apply to all repository changes.

- [ ] **Step 1: Describe repository structure and module boundaries**

Create `AGENTS.md` with a heading `# Repository working guide`. Document these paths and responsibilities:

- `src/index.ts` and `src/routes/`: Worker entry point and HTTP routes.
- `src/feeds/`: RSS/Atom and GDELT collection and normalization.
- `src/ai/`: prompts, Workers AI calls, output contracts, and validation.
- `src/pipeline/`: scheduled/manual orchestration, bounded ingestion, failure isolation, and digest fallback.
- `src/db/` and `migrations/`: D1 types, repositories, schema, and curated source seeds.
- `src/render/` and `public/`: server-rendered zh-HK pages and static assets.
- `tests/worker/`: Worker, route, repository, pipeline, security, feed, and deployment regression tests.
- `docs/operations.md`: canonical production runbook.

- [ ] **Step 2: Define editorial and pipeline invariants**

Require Hong Kong Traditional Chinese public copy, a neutral and factual tone, source-grounded summaries, preserved official English names when useful, original-source links, and AI disclosure. Prohibit invented facts, numbers, quotations, causal claims, opinions, and copied full articles. State that AI output must pass validation before persistence, one bad story must not stop the batch, ingestion/query sizes stay bounded, and invalid digest AI output falls back to a partial digest built only from validated stories.

- [ ] **Step 3: Define the change and verification workflow**

Require contributors to inspect existing patterns, keep edits focused, preserve unrelated worktree changes, add regression tests for behavior changes, and run commands proportional to risk. Set the normal pre-handoff gate to:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

State that documentation-only changes may use targeted path/script/link checks plus `git diff --check`, while code, schema, feed, prompt, pipeline, or binding changes require the full gate.

- [ ] **Step 4: Define Cloudflare and secret safety rules**

State that production D1 or Worker operations must be intentional, scoped, and verified. Require local D1 unless remote access is explicitly needed, migrations for schema/source-seed changes, and post-deploy checks of `/health`, `/`, `/digest/latest`, `/rss.xml`, and `/sitemap.xml`. Prohibit printing or committing GitHub PATs, Cloudflare API tokens, `ADMIN_TOKEN`, `.env`, `.dev.vars`, and shell startup credentials. If a temporary admin secret is used, require deletion immediately after the run, including failure paths.

- [ ] **Step 5: Verify AGENTS.md and scan both documents**

Run:

```bash
test -f AGENTS.md
for path in README.md docs/operations.md src tests/worker migrations public; do test -e "$path" || exit 1; done
! rg -n "TBD|TODO|00000000-0000-0000-0000-000000000000" README.md AGENTS.md
! rg -n "(ghp_|github_pat_|CF_API_TOKEN=|CLOUDFLARE_API_TOKEN=|GITHUB_PAT=|ADMIN_TOKEN=[A-Za-z0-9_-]{16,})" README.md AGENTS.md
git diff --check -- README.md AGENTS.md
```

Expected: all existence checks pass; both `rg` commands return no matches; `git diff --check` prints nothing.

- [ ] **Step 6: Review the documentation diff for responsibility overlap**

Run:

```bash
git diff -- README.md AGENTS.md docs/operations.md
```

Expected: README explains and onboards, AGENTS.md instructs contributors, `docs/operations.md` remains the detailed runbook, and no production value or behavior is changed.

- [ ] **Step 7: Commit the agent guide**

```bash
git add AGENTS.md
git commit -m "docs: add repository agent guide"
```

Expected: one commit containing only `AGENTS.md`.
