# Cloudflare 部署與營運

本文件假設 Cloudflare zone 已包含 `cchk.uk`，而你有權限建立 D1、Worker secret 及 custom domain。

## 1. 建立 D1 並更新 Wrangler

在 repository 根目錄執行：

```bash
npx wrangler d1 create ainews
```

把輸出中的 UUID 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`，不要保留 `00000000-0000-0000-0000-000000000000`。然後套用 schema：

```bash
npx wrangler d1 migrations apply DB --remote
```

本地資料庫則使用：

```bash
npm run db:migrate:local
```

本專案將 local D1 與 remote D1 分開；不要在本地開發時意外使用 remote binding。

## 2. 設定來源

第一版的主要來源是 D1 `sources` allowlist。GDELT 會由 pipeline 自動建立為 disabled metadata row，並作為 supplemental discovery。新增 RSS／Atom 來源可用 D1 execute：

```bash
npx wrangler d1 execute ainews --remote --command="INSERT INTO sources (name, publisher_url, feed_url, default_category, language, enabled, created_at, updated_at) VALUES ('Example AI', 'https://example.com', 'https://example.com/feed.xml', '模型與研究', 'en', 1, datetime('now'), datetime('now'));"
```

`default_category` 必須是：`模型與研究`、`產品與公司`、`開源與開發者`、`政策與安全` 或 `投資與產業`。停用來源而不改 code：

```bash
npx wrangler d1 execute ainews --remote --command="UPDATE sources SET enabled = 0, updated_at = datetime('now') WHERE feed_url = 'https://example.com/feed.xml';"
```

建議先加入約 15–20 個可靠的官方公司、研究、開發者及科技媒體 RSS；不要把付費 API key 放在 feed URL。

## 3. 設定 admin secret

admin endpoint 只接受 `Authorization: Bearer ...`，secret 不放進 `wrangler.jsonc`：

```bash
npx wrangler secret put ADMIN_TOKEN
```

本地測試可在未提交的 `.dev.vars` 放入：

```text
ADMIN_TOKEN="local-only-random-value"
```

輪換 token 時先寫入新值，再重新驗證 endpoint，最後撤銷舊值。不要在 shell history、GitHub issue 或 logs 貼出 token。

## 4. 本地 Cron 與 pipeline

啟動 Worker：

```bash
npm run dev
```

Wrangler 提供 scheduled test route，可指定 UTC 時間：

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json&time=1784246400000"
```

手動 dry run 不應寫入 published stories 或 digest：

```bash
curl -X POST "http://localhost:8787/admin/run" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"date":"2026-07-17","dryRun":true}'
```

正式手動執行前，先使用 dry run；確認來源和 AI 輸出後才使用 `dryRun:false`。每日主 Cron 設定為 `0 6 * * *`，即 UTC 06:00／香港 14:00；`30 6 * * *`（香港 14:30）會執行一次 recovery retry。recovery 只會重試當日已標記為 `selected` 或 `failed` 的 ingestion rows，不會重新擷取 feed 或處理未選取的新文章。

如需手動重試同一 UTC 日期的失敗文章，可在確認範圍後使用：

```bash
curl -X POST "http://localhost:8787/admin/run" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"date":"2026-07-17","retryFailedOnly":true}'
```

## 5. 檢查 pipeline

health endpoint 不會暴露 credentials：

```bash
curl https://ainews.cchk.uk/health
```

查看最近 run、文章數量及 digest：

```bash
npx wrangler d1 execute ainews --remote --command="SELECT run_key, status, feeds_attempted, feeds_succeeded, stories_published, digest_id, errors_json FROM pipeline_runs ORDER BY id DESC LIMIT 10;"
npx wrangler d1 execute ainews --remote --command="SELECT digest_date, status, headline_zh_hk FROM digests ORDER BY digest_date DESC LIMIT 10;"
npx wrangler d1 execute ainews --remote --command="SELECT id, slug, category, source_name, published_at FROM stories WHERE status = 'published' ORDER BY published_at DESC LIMIT 20;"
```

常見狀態：`completed` 代表文章及 digest 成功；`partial` 代表部分 feed／story／digest 有錯但仍有有效內容；`failed` 代表沒有有效文章或 pipeline 無法完成。AI 失敗會保留 bounded error，不會阻止其他文章繼續。

## 6. D1 ingestion retention

每次 live pipeline run 最多移除 500 條未被引用、`discovered_at` 嚴格早於 90 日，且狀態必須恰好是 `new`、`selected`、`failed` 或 `rejected` 的 `ingested_items`。任何已發佈的 story 或 digest 都不會被刪除。

以以下唯讀查詢監察仍然存在的 stale、未被引用 ingestion rows：

```bash
npx wrangler d1 execute ainews --remote --command="SELECT COUNT(*) AS stale_unreferenced_items FROM ingested_items i WHERE i.discovered_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days') AND i.status IN ('new', 'selected', 'failed', 'rejected') AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.ingested_item_id = i.id);"
```

## 7. GitHub Actions 部署

在 GitHub repository 的 Settings → Secrets and variables → Actions 加入：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Workflow 會在 push 到 `main` 或手動觸發時執行 `npm ci`、typecheck、tests，再執行 `npx wrangler deploy`。API token 應只具備部署所需的最低 Cloudflare 權限；不要加入 `GITHUB_PAT`，也不要從 `.bashrc` 讀 secrets。

## 8. Custom domain

`wrangler.jsonc` 已宣告 `ainews.cchk.uk` 為 custom domain。首次 deploy 前，確認 `cchk.uk` 是 Cloudflare active zone，且該 hostname 沒有既有 CNAME 衝突。亦可在 Cloudflare Dashboard 的 Workers & Pages → Worker → Settings → Domains & Routes → Add → Custom Domain 加入 `ainews.cchk.uk`。

部署後檢查：

```bash
curl -I https://ainews.cchk.uk/
curl https://ainews.cchk.uk/rss.xml
curl https://ainews.cchk.uk/sitemap.xml
```

最後在 Cron Events／Workers Logs 及 D1 `pipeline_runs` 確認第一個正式 run，再檢查首頁、digest、文章頁及 AI usage。若需要改時間，修改 `wrangler.jsonc` 的 `triggers.crons` 後重新部署；Cron 使用 UTC。
