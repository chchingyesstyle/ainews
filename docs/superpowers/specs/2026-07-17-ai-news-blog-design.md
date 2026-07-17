# AI News Hong Kong Design Specification

**Status:** Design approved by the product owner for written-spec review  
**Site:** `https://ainews.cchk.uk`  
**Audience:** Hong Kong readers who want a fast, trustworthy overview of global AI news  
**Language:** Traditional Chinese for Hong Kong, `zh-HK`  
**Editorial tone:** Neutral and factual  

## Product goal

Build an automatically updated AI news blog that publishes both individual source-linked stories and one daily digest. The system will collect news from curated RSS/Atom feeds plus GDELT discovery, use Cloudflare Workers AI to produce short Traditional Chinese summaries, store publication data in Cloudflare D1, and serve the site from Cloudflare Workers at `ainews.cchk.uk`.

The product should help a reader understand the day’s important developments in roughly two minutes, while preserving a clear trail back to the original publisher.

## Scope

### First-release requirements

- Collect from 15–20 configured RSS/Atom feeds.
- Use the legacy GDELT DOC 2.0 endpoint as a supplemental discovery source.
- Run one ingestion and publishing job every day.
- Select approximately 8–12 new stories for AI processing each day.
- Generate a Traditional Chinese story headline, short summary, key facts, category, and named entities.
- Generate one daily digest from the successfully processed stories.
- Publish individual story pages with canonical source links.
- Publish digest pages, RSS, sitemap, category archives, search, and a health endpoint.
- Store source metadata, generated content, digest membership, and pipeline results in D1.
- Serve the public site and the scheduled pipeline from one Cloudflare Worker.
- Use a Cloudflare Workers AI binding and a D1 binding.
- Deploy through the GitHub repository to Cloudflare Workers.

### Explicit non-goals for the first release

- Reproducing full source articles or maintaining a full-text archive.
- Scraping every website on the internet.
- User accounts, comments, reactions, or personalization.
- Paid news feeds or a paid news-search service.
- Opinion, prediction, investment advice, or editorial commentary.
- Social-media publishing, email newsletters, or push notifications.
- A full administrative dashboard.
- Bilingual publication. English source titles and product names may remain in the story metadata, but the generated editorial copy is zh-HK.

## Architecture

The first release is a single TypeScript Cloudflare Worker with three responsibilities:

1. Serve the public HTML pages and public machine-readable feeds.
2. Run the daily scheduled pipeline.
3. Read and write Cloudflare D1.

The Worker will use TypeScript, Hono for request routing, server-rendered HTML with Hono JSX templates, plain CSS, and minimal vanilla JavaScript for search and progressive interactions. Static CSS, icons, and other public assets will be deployed with the Worker. The public experience does not require a client-side SPA.

### Cloudflare resources

- **Worker:** public routes, scheduled handler, pipeline orchestration.
- **D1:** sources, discovered items, published stories, digests, and run history.
- **Workers AI:** zh-HK story summaries and daily digest generation.
- **Custom domain:** `ainews.cchk.uk` routed to the Worker.
- **Secrets:** deployment credentials and the protected admin token, stored as Cloudflare/GitHub secrets rather than committed files.

The default schedule is `0 6 * * *`, which runs at 06:00 UTC, or 14:00 Hong Kong time. The schedule remains configurable in Wrangler. Cloudflare Cron Triggers call the Worker’s `scheduled()` handler and use UTC. See the [Cron Triggers documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

The design targets the free tier by limiting the first version to 15–20 feeds, 8–12 AI-selected stories, and one digest per day. Current reference limits include 50 external subrequests per free Worker invocation, 100,000 Worker requests per day, 5 million D1 rows read per day, 100,000 D1 rows written per day, and 10,000 Workers AI neurons per day. These limits must be checked again before deployment because Cloudflare may change plan details. References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Data flow

```text
Daily Cron
  → load enabled sources from D1
  → fetch RSS/Atom feeds in bounded batches
  → query GDELT DOC 2.0 for recent AI candidates
  → parse and normalize items
  → canonicalize URLs and remove duplicates
  → rank and cap the daily candidate set
  → optionally fetch a public source page for a better excerpt
  → call Workers AI for each selected story
  → validate the structured AI response
  → write valid stories to D1
  → call Workers AI with story summaries to create the digest
  → validate and write the digest
  → publish the public pages and machine-readable feeds
```

### Source collection

The primary source list is a D1-managed allowlist of RSS/Atom feeds. It should begin with official AI company, research, developer, and technology sources. Each source has a publisher name, feed URL, default category, language metadata, and enabled flag.

GDELT DOC 2.0 is a supplemental discovery channel, not a publication allowlist. Its results are filtered by AI-related queries, normalized, deduplicated, and ranked against the configured source policy before publication. The official DOC 2.0 examples show article-list results and RSS/JSON output through direct URLs: [GDELT DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/).

The Worker will not fetch arbitrary pages for every candidate. It will first use the feed title and excerpt, then fetch only shortlisted public pages when the feed content is insufficient. If a publisher blocks the request or returns unusable markup, the feed excerpt remains the input. Full article text is not retained as a product feature.

### Normalization and deduplication

- Prefer the feed’s canonical link, then the source page’s canonical URL when available.
- Remove tracking parameters such as common campaign parameters.
- Normalize protocol, host casing, trailing slashes, and fragments.
- Use the normalized URL as the primary uniqueness key.
- Use a normalized title hash as a secondary duplicate check.
- Treat near-identical titles from multiple publishers as related coverage, not separate digest entries, when the duplicate rule is sufficiently confident.
- Preserve multiple source links when they provide materially different coverage.

### Selection

Selection is deterministic before AI processing. It considers recency, enabled source priority, category balance, duplicate status, and whether the item has enough source text to summarize. A daily run may store more discovered items than it publishes, but only the selected set consumes the main AI budget.

## D1 data model

### `sources`

Stores the configured feed allowlist.

- `id` integer primary key
- `name` text not null
- `publisher_url` text not null
- `feed_url` text not null unique
- `default_category` text not null
- `language` text not null
- `enabled` integer not null default 1
- `last_fetched_at` text
- `failure_count` integer not null default 0
- `created_at` text not null
- `updated_at` text not null

### `ingested_items`

Stores discovery metadata and deduplication state.

- `id` integer primary key
- `source_id` integer not null references `sources(id)`
- `guid` text
- `canonical_url` text not null unique
- `title` text not null
- `source_excerpt` text
- `published_at` text
- `discovered_at` text not null
- `title_hash` text not null
- `status` text not null, one of `new`, `selected`, `published`, `rejected`, `failed`
- `last_error` text

### `stories`

Stores the publishable individual story.

- `id` integer primary key
- `ingested_item_id` integer not null unique references `ingested_items(id)`
- `slug` text not null unique
- `headline_zh_hk` text not null
- `summary_zh_hk` text not null
- `key_facts_json` text not null
- `category` text not null
- `named_entities_json` text not null
- `source_name` text not null
- `source_url` text not null
- `source_published_at` text
- `published_at` text
- `status` text not null, one of `published`, `failed`, `hidden`
- `model_id` text not null
- `prompt_version` text not null
- `created_at` text not null
- `updated_at` text not null

### `digests`

Stores one dated digest per UTC publication date.

- `id` integer primary key
- `digest_date` text not null unique
- `headline_zh_hk` text not null
- `intro_zh_hk` text not null
- `sections_json` text not null
- `status` text not null, one of `published`, `partial`, `failed`
- `model_id` text not null
- `prompt_version` text not null
- `published_at` text
- `created_at` text not null
- `updated_at` text not null

### `digest_stories`

Associates stories with their digest order.

- `digest_id` integer not null references `digests(id)`
- `story_id` integer not null references `stories(id)`
- `position` integer not null
- Composite primary key on `digest_id` and `story_id`

### `pipeline_runs`

Stores operational evidence and partial failure details.

- `id` integer primary key
- `run_key` text not null unique, formatted as the UTC run date
- `started_at` text not null
- `finished_at` text
- `status` text not null, one of `running`, `completed`, `partial`, `failed`
- `feeds_attempted` integer not null default 0
- `feeds_succeeded` integer not null default 0
- `items_discovered` integer not null default 0
- `stories_selected` integer not null default 0
- `stories_published` integer not null default 0
- `digest_id` integer
- `errors_json` text not null default `[]`

Indexes will cover `published_at`, `category`, `status`, `source_id`, `digest_date`, and `title_hash`. Unique constraints and upserts make reruns safe.

## AI contract

The Worker will call a pinned Workers AI text-generation model through the `AI` binding. The model identifier is configuration, not content data, so changing the model does not rewrite existing articles.

### Story prompt contract

Input fields:

- Source name
- Original title
- Original publication date
- RSS excerpt or bounded extracted text
- Canonical source URL

Required output:

```json
{
  "headline_zh_hk": "string",
  "summary_zh_hk": "string",
  "key_facts": ["string", "string", "string"],
  "category": "模型與研究|產品與公司|開源與開發者|政策與安全|投資與產業",
  "named_entities": ["string"]
}
```

The prompt will instruct the model to write in Hong Kong Traditional Chinese, remain neutral and factual, preserve official English names where helpful, avoid unsupported claims, avoid invented numbers or quotations, and indicate uncertainty rather than fill gaps.

### Digest prompt contract

The digest model receives only validated story outputs, not a blank request to research the web. It may organize, shorten, and connect the supplied facts, but may not introduce facts not present in those stories.

Required output:

```json
{
  "headline_zh_hk": "string",
  "intro_zh_hk": "string",
  "sections": [
    {
      "category": "string",
      "summary_zh_hk": "string",
      "story_ids": [1, 2]
    }
  ]
}
```

The application validates JSON, allowed categories, required fields, string lengths, and story membership before writing the result. Failed validation excludes the output from publication.

## Public routes and content experience

- `/`: today’s digest lead, selected latest stories, categories, and source transparency.
- `/digest/YYYY-MM-DD`: full daily digest with linked story entries.
- `/story/:slug`: one story with title, summary, key facts, publisher, original time, original link, related coverage, and AI disclosure.
- `/category/:category`: archive filtered by category.
- `/search?q=...`: case-insensitive D1 `LIKE` search over headline, summary, and source name, capped at 50 results and ordered by publication time.
- `/rss.xml`: recent published stories.
- `/sitemap.xml`: published story and digest URLs.
- `/health`: non-sensitive health status for deployment checks.

### Homepage layout

The homepage is a calm editorial reading surface rather than a dashboard:

- Header with site name, 今日摘要, 最新動態, category links, search, and RSS.
- Lead digest with date, update time, key developments, and reading time.
- Typographic story stream with publisher, category, time, headline, short summary, and `閱讀原文`.
- Compact source and methodology area near the footer.

### Story layout

Each story page presents the Chinese headline first, then source metadata, the short factual summary, three key facts, related stories, and a prominent source link. The page includes the disclosure: `內容由 AI 整理，原文請以來源為準。`

### Visual system

- Warm paper-toned light background.
- Near-black ink color with a slight cool tint.
- One restrained cinnabar accent for dates, categories, and links.
- Traditional Chinese serif display type paired with a clean sans-serif interface type.
- Generous whitespace, thin separators, strong type hierarchy, and no repetitive card grid.
- Mobile-first single-column reading flow with comfortable Chinese line height.
- `lang="zh-HK"`, semantic headings, keyboard support, and accessible color contrast.

## Error handling and operations

The scheduled handler creates or resumes one run per UTC date. A rerun updates the existing run and uses D1 uniqueness constraints to avoid duplicates.

- Feed requests use bounded timeouts and independent failure handling.
- Feeds are fetched in small batches to protect external subrequest limits.
- A failed feed increments its failure count and does not stop the run.
- A blocked source page falls back to the feed excerpt.
- A failed story summary is recorded and omitted from the digest.
- A digest with fewer than three valid stories is published as `partial` with a factual data-availability notice, or remains unpublished if no valid stories exist.
- `/health` reports Worker availability, D1 availability, the last completed run, and the last run status without exposing credentials.
- A protected `POST /admin/run` endpoint accepts `{ "date": "YYYY-MM-DD", "dryRun": true|false }` with an `Authorization: Bearer <ADMIN_TOKEN>` header. It requires a Cloudflare secret and is never linked from public pages.
- Pipeline logs contain counts and error classes, not source secrets or raw credential values.

## Security and deployment

- The GitHub PAT is for repository access only and must not be passed to the Worker or browser.
- Do not commit `.env` files, shell profiles, tokens, or deployment credentials.
- Store `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and the admin token in GitHub Actions or Cloudflare secret storage.
- Use the minimum Cloudflare API token permissions required for deployment.
- Validate and escape all source-derived and AI-generated strings before rendering HTML.
- Render only a small approved markup subset, or render generated copy as text.
- Keep full source articles out of D1; store only metadata and bounded excerpts needed for processing and traceability.
- Add a source-level enable/disable switch so a publisher can be removed without code deployment.

## Verification plan

### Unit tests

- Parse RSS 2.0 feeds with missing optional fields.
- Parse Atom feeds with alternate link structures.
- Normalize URLs and remove tracking parameters.
- Generate stable title hashes.
- Reject invalid categories and malformed AI JSON.
- Generate stable slugs for Traditional Chinese headlines with a collision suffix.

### Integration tests

- Insert a source, ingest an item, summarize it with a mocked AI binding, and publish a story.
- Rerun the same date and confirm no duplicate item, story, or digest is created.
- Fail one feed and confirm other feeds and the digest continue.
- Fail one story AI call and confirm the story is omitted while the run is marked partial.
- Validate digest membership and story ordering.
- Verify D1 indexes and query paths for homepage, archive, search, and digest pages.

### Route and accessibility tests

- Render homepage, story, digest, RSS, sitemap, and health responses.
- Confirm `lang="zh-HK"`, canonical URLs, Open Graph metadata, and article structured data.
- Confirm keyboard navigation, semantic heading order, visible focus, and mobile layout.

### Deployment verification

- Run the scheduled handler locally through Wrangler’s scheduled test route.
- Run a dry-run pipeline that writes no published content.
- Deploy to a preview Worker and run a controlled manual pipeline.
- Attach `ainews.cchk.uk` only after the preview passes.
- Verify the first live Cron run, D1 rows, AI usage, public pages, RSS, and sitemap.

## Success criteria

The first release is successful when:

1. `ainews.cchk.uk` serves the homepage, digest pages, story pages, RSS, sitemap, search, and health endpoint.
2. One daily Cron run discovers and deduplicates feed and GDELT items.
3. The run publishes valid zh-HK summaries for the selected stories and a linked digest.
4. Every published story has a visible publisher, source date where available, canonical original link, and AI disclosure.
5. Rerunning the pipeline does not create duplicates.
6. Individual feed, source-page, and AI failures are recorded without preventing unrelated stories from publishing.
7. The site remains within the planned first-release feed, story, D1, Worker, and Workers AI limits under normal daily usage.
8. No GitHub PAT, Cloudflare token, or admin secret appears in repository files, HTML, logs, or client-side JavaScript.

## Future extensions

Once the first release is stable, the next candidates are a source-management UI, Cloudflare Queues or Workflows for larger batches, bilingual output, email or social distribution, article-level correction workflow, and a richer related-coverage view.

