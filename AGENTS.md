# Repository working guide

## 適用範圍

本文件適用於整個 repository，供 coding agents 及開發者修改「AI 新聞．香港」時使用。產品概覽及基本指令見 [README.md](README.md)；D1、來源、Cron、secrets、GitHub Actions、custom domain 和 production diagnostics 的詳細程序以 [docs/operations.md](docs/operations.md) 為準。

本專案是部署在 Cloudflare Workers 的香港繁體中文 AI 新聞網站。主要技術包括 TypeScript、Hono、Workers AI、D1、Cron Triggers、RSS／Atom、Wrangler 和 Vitest。

## Repository 結構

- `src/index.ts`：Worker entry point，組合 routes、scheduled handler 和 bindings。
- `src/routes/`：公開頁面、feeds、health 及受保護 admin routes。
- `src/feeds/`：RSS／Atom、GDELT 擷取、解析、正規化及大小限制。
- `src/ai/`：zh-HK prompts、Workers AI calls、輸出 contracts 和 validation。
- `src/pipeline/`：每日及手動 pipeline orchestration、bounded ingestion、candidate selection、failure isolation 和 digest fallback。
- `src/db/`：D1 types 及 repositories；SQL 只應集中在清晰的 data-access boundaries。
- `migrations/`：D1 schema 和 curated source seeds。Schema 或 seed 改動必須透過新 migration，不可只修改 production database。
- `src/render/`：server-rendered zh-HK layouts、pages 和 components。
- `public/`：Worker static assets。
- `tests/worker/`：routes、repositories、pipeline、feeds、AI validation、安全、metadata 和 deployment regression tests。
- `docs/operations.md`：production runbook；不要把完整營運程序複製到其他文件。

## 核心資料流程與不變條件

每日流程是：讀取 enabled sources、擷取和正規化 items、限制 ingestion、去重及選出 candidates、逐篇呼叫 Workers AI、驗證輸出、儲存 stories、建立 digest、記錄 `pipeline_runs`，最後由 Worker 提供公開內容。

修改相關程式時必須保留以下行為：

- Feed response、ingestion 和 recent-item queries 必須有明確上限，避免 Worker timeout 或 D1 payload 過大。
- 同一 canonical URL 或等價 title fingerprint 不應重複發佈。
- 每篇 story 的 AI failure 必須隔離；一篇失敗不可中止其他候選文章。
- 所有 AI 輸出必須先通過 schema、型別、長度、category、HTML 和 ID validation，才可持久化。
- Workers AI JSON response 可能是字串或結構化 `response` object，兩種格式都要保留 regression coverage。
- Digest AI 輸出無效時，必須使用已驗證 stories 建立 deterministic partial digest，不可留下首頁摘要空白。
- Errors 只保存 bounded、非敏感訊息；不得寫入 source credentials、authorization headers 或 secret values。
- Dry run 不得建立或更新 published stories、digests 或 pipeline run rows。

## 編輯與內容規則

所有公開 UI、headline、summary、digest 和狀態文案使用香港繁體中文；必要的官方產品、公司、模型和技術名稱可保留英文。語氣保持中立、簡潔、事實為本。

AI prompts、validation 或 rendering 的改動必須維持以下規則：

- 只根據提供的來源 metadata、title 和 bounded excerpt 整理內容。
- 不可創作來源沒有提供的事實、數字、引述、因果關係、預測或評論。
- 資料不足時明確表示限制，不以推測補充內容。
- 每篇 story 必須保留 canonical original-source link。
- 不複製或儲存完整新聞文章；只保留必要 metadata、有限 excerpt 和模型產生的摘要。
- 公開內容維持「內容由 AI 整理，原文請以來源為準。」的 disclosure。

## 修改流程

1. 修改前先閱讀相關 route、repository、pipeline、test 和 migration，沿用現有 boundaries 及 naming。
2. 保持改動集中於使用者要求；不得覆寫或清除無關的 worktree changes。
3. 修正 bug 或改變行為時，先加入能重現問題的 regression test，再作最小實作。
4. Schema 或 curated sources 改動需新增 migration，並同時驗證 local 及 remote migration strategy。
5. Prompt、model binding、feed、pipeline、route 或 D1 改動必須考慮 timeout、partial failure、deduplication 和 idempotency。
6. 未獲使用者要求或批准時，不要 commit、push、deploy、寫入 remote D1 或修改 Cloudflare secrets。

搜尋檔案和文字時優先使用 `rg --files` 和 `rg`。修改檔案使用可審核的 patch；不要以 destructive Git commands 清除現有工作。

## 驗證門檻

一般 code、schema、feed、prompt、pipeline 或 binding 改動在 handoff 前必須執行：

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

`npm run build` 是 Wrangler dry-run。測試輸出中的 Workers AI remote-binding warning 並不等於失敗；仍要以 exit code、test count 和 failure count 判斷結果。

文件專用改動可使用較窄的驗證，但至少必須：

- 檢查每個引用 path 和 npm script 確實存在。
- 搜尋未完成 placeholder 和疑似 secret pattern。
- 執行 `git diff --check`。
- 閱讀完整 documentation diff，確認 README、AGENTS.md 和 operations runbook 沒有互相矛盾。

只可根據最新、完整的 command output 宣稱測試或 build 通過。

## Cloudflare 操作規則

- 本地開發預設使用 local D1；只有工作明確需要 remote state 時才使用 `--remote`。
- Production Worker、D1、Cron、routes 和 secrets 的 mutation 必須是使用者要求範圍內的必要操作，並在執行後核對結果。
- Deploy 後按風險檢查 `/health`、`/`、`/digest/latest`、`/rss.xml` 和 `/sitemap.xml`，並在需要時查閱最新 `pipeline_runs`、stories 和 digests。
- 手動正式 pipeline 前先使用 dry run，除非當前任務已明確驗證同一變更並要求立即刷新。
- 若為單次操作建立臨時 `ADMIN_TOKEN`，必須等待 secret propagation，並在成功或失敗後立即刪除。不得把 token 留作長期入口。
- `partial` 可以是安全且可發佈的結果，但 handoff 必須說明失敗來源及實際已發佈內容；不得把它描述成完整成功。

## Secrets 與敏感資料

不得讀出、打印、記錄或提交以下內容的實際值：

- GitHub PAT 或任何 `GITHUB_PAT` 值
- Cloudflare API token 或 `CLOUDFLARE_API_TOKEN` 值
- Worker `ADMIN_TOKEN`
- `.env`、`.dev.vars` 或 shell startup files 內的 credentials
- Authorization headers、signed URLs 或其他可重用 credentials

Shell startup file 中存在 credential 只代表可供已授權操作使用，不代表可展示、複製到文件、傳入 Worker runtime 或加入 GitHub Actions。Command output 亦不得意外展開 secret。若懷疑 credential 已出現在 diff 或 logs，停止後續外部操作並通知使用者輪換。

## Handoff 要求

完成工作時，簡潔列出：

- 修改了甚麼及原因
- 使用了哪些 migration、model、route 或 pipeline behavior
- 實際執行的驗證及結果
- 尚存的 partial failure、限制或 follow-up
- commit／branch／deployment 狀態（只在實際執行過時提供）

不要以「應該可以」取代驗證證據，也不要把未執行的 deployment 或 push 描述成已完成。
