# AI 新聞．香港

[AI 新聞．香港](https://ainews.cchk.uk) 是一個部署在 Cloudflare Workers 的香港繁體中文 AI 新聞網站。系統每日從免費的 RSS／Atom 來源擷取全球人工智能消息，以 Cloudflare Workers AI 整理成中立、事實為本的摘要，並把來源、文章、每日摘要及執行紀錄儲存在 Cloudflare D1。

網站由同一個 Worker 提供 server-rendered HTML、搜尋、RSS、sitemap 和 health endpoint，不需要另設傳統伺服器。現行 Workers AI model binding 使用 `@cf/meta/llama-3.2-3b-instruct`。

## 系統組成

- **Cloudflare Workers + Hono**：HTTP routes、排程入口及 server-side rendering。
- **Workers AI**：產生香港繁體中文文章摘要和每日 digest。
- **Cloudflare D1**：儲存來源、擷取項目、文章、digest 和 pipeline run 紀錄。
- **Cron Triggers**：每日 UTC 06:00／香港 14:00 執行 pipeline。
- **RSS／Atom**：免費主要新聞來源；GDELT 只作補充 discovery。
- **Vitest + Workers test pool**：驗證 routes、repositories、pipeline、feeds、安全和部署設定。

## 每日處理流程

1. 從 D1 讀取已啟用的 RSS／Atom 來源，並嘗試以 GDELT 補充候選消息。
2. 正規化及限制擷取項目數量，再按 URL、標題和來源資料去重及選出候選文章。
3. 把有限的來源 metadata 和 excerpt 交給 Workers AI，產生中立、source-grounded 的香港繁體中文摘要。
4. 發佈前驗證每個 AI 欄位；單篇失敗只會記錄 bounded error，不會中止整個批次。
5. 以已驗證文章建立每日 digest；若 digest AI 輸出不合規，會以已驗證文章資料建立 deterministic partial digest。
6. 把結果和執行狀態儲存在 D1，再由 Worker 提供公開頁面、RSS 和 sitemap。
7. 每次 live run 最多移除 500 條未被引用、嚴格早於 90 日，且狀態必須恰好是 `new`、`selected`、`failed` 或 `rejected` 的 ingestion rows；任何已發佈的 story 或 digest 都不會被刪除。

`completed` 表示該批次完整完成；`partial` 表示部分來源、文章或 digest 發生錯誤，但仍有有效內容可發佈；`failed` 表示沒有有效文章或 pipeline 無法完成。

## 本地開發

需要 Node.js 22 或以上。涉及 remote D1 或部署時，亦需要已授權的 Wrangler／Cloudflare credentials。

```bash
npm install
npm run db:migrate:local
npm run dev
```

常用驗證：

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` 只執行 Wrangler deployment dry-run，不會部署或修改 production。

## 部署與資料庫

套用 remote D1 migrations，然後部署 Worker：

```bash
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

正式 Cron 設定為 `0 6 * * *`，即 UTC 06:00／香港 14:00。D1、來源管理、手動 pipeline、admin secret、GitHub Actions、custom domain 和故障檢查的完整步驟見 [Cloudflare 部署與營運](docs/operations.md)。

受保護的手動執行 endpoint 是 `POST /admin/run`。Bearer token 必須由環境變數提供，不可寫入 command、文件或 repository：

```bash
curl -X POST "https://ainews.cchk.uk/admin/run" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"date":"2026-07-17","dryRun":true}'
```

正式執行前應先使用 `dryRun:true`。若使用臨時 `ADMIN_TOKEN`，完成或失敗後都要立即從 Worker 刪除。

## 公開路由

- `/`：今日 digest lead 和最新文章
- `/digest/latest`：最新每日摘要
- `/digest/YYYY-MM-DD`：指定日期摘要
- `/story/:slug`：單篇文章及原文連結
- `/category/:category`：分類 archive
- `/search?q=...`：文章搜尋
- `/rss.xml`：RSS 2.0 feed
- `/sitemap.xml`：公開 URL sitemap
- `/health`：Worker、D1 及最近 pipeline 狀態
- `POST /admin/run`：Bearer token 保護的手動 pipeline／dry run

## 編輯與內容原則

- 公開內容使用香港繁體中文，保持中立、簡潔和事實為本。
- AI 只可根據輸入來源整理，不可加入未提供的事實、數字、引述、因果關係、預測或評論。
- 文章保留原文連結、來源 metadata 和有限 excerpt，不複製完整原文。
- 每篇內容均顯示「內容由 AI 整理，原文請以來源為準。」
- AI 輸出必須通過 schema、長度、category、HTML 和 story ID 驗證才可儲存或發佈。

## 安全提醒

不要把 GitHub PAT、Cloudflare API token、`ADMIN_TOKEN`、`.env`、`.dev.vars` 或 shell startup files 內的 credentials 提交到 repository、貼到 issue，或輸出到 logs。

GitHub Actions 只使用 repository secrets 中的 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。GitHub PAT 只可用於 repository 存取，不應傳入 Worker、D1、前端或 deployment runtime。

開發者及 coding agent 的 repository 規則見 [AGENTS.md](AGENTS.md)。
