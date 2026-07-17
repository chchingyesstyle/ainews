# AI 新聞．香港

`ainews.cchk.uk` 是一個部署在 Cloudflare Workers 的香港繁體中文 AI 新聞 blog。它每天從已設定的 RSS／Atom 來源及 GDELT 發現候選新聞，以 Workers AI 產生中立、事實為本的摘要，將文章和每日 digest 儲存在 D1，再由同一個 Worker 提供 HTML、RSS、sitemap 和 health endpoint。

目前 repository 已完成第一版 Worker、D1 schema、feed collection、AI contract、每日 pipeline、Cron、公開頁面及部署 workflow。正式部署前仍需要把 Wrangler 設定內的 D1 placeholder 換成你 Cloudflare account 的 database ID，並加入來源及 secrets。

## 本地開發

需要 Node.js 22 或以上，以及一個已登入 Cloudflare 的 Wrangler：

```bash
npm install
npx wrangler login
npm run db:migrate:local
npm run dev
```

常用檢查：

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` 是 Wrangler dry-run，不會部署。詳細的 D1、來源、Cron、admin token 及 custom domain 步驟見 [docs/operations.md](docs/operations.md)。

## 公開路由

- `/`：每日摘要 lead 和最新文章
- `/digest/YYYY-MM-DD`：指定日期 digest
- `/story/:slug`：單篇文章及原文連結
- `/category/:category`：分類 archive
- `/search?q=...`：文章搜尋
- `/rss.xml`：RSS 2.0
- `/sitemap.xml`：公開 URL sitemap
- `/health`：Worker／D1 health check
- `POST /admin/run`：Bearer token 保護的手動 pipeline／dry run

文章只保留來源 metadata、有限 excerpt 和模型產生的摘要，不複製完整原文；每篇文章均顯示原文來源及「內容由 AI 整理，原文請以來源為準。」

## 安全提醒

不要把 GitHub PAT、Cloudflare API token、`ADMIN_TOKEN`、`.env` 或 `.dev.vars` 提交到 repository。GitHub Actions 只使用 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` secrets；GitHub PAT 僅用於 repository 存取，不會傳入 Worker 或瀏覽器。
