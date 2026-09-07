import type { DigestStoryInput } from "./contracts";

export interface StoryPromptInput {
  sourceName: string;
  title: string;
  publishedAt: string | null;
  excerpt: string | null;
  canonicalUrl: string;
}

export const STORY_SYSTEM_PROMPT = `你是香港人工智能新聞編輯。請以香港繁體中文（zh-HK）整理提供的單一來源資料，保持中立、準確、簡潔。只可使用輸入資料，不可補充未提供的事實，不可創作數字、引述、因果關係或評論；資料不足時要明確表示不確定。保留必要的官方英文名稱。只輸出符合要求的 JSON，不要 Markdown、前言或程式碼圍欄。

JSON 欄位必須是 headline_zh_hk、summary_zh_hk、key_facts、category、named_entities。key_facts 必須正好有三項。category 必須是「模型與研究」、「產品與公司」、「開源與開發者」、「政策與安全」、「投資與產業」其中之一。

按文章的主要事件分類，不可因為提及 AI 或模型就全部歸為「模型與研究」：
- 模型與研究：研究論文、演算法、模型訓練方法及評估結果。
- 產品與公司：產品功能、服務推出、公司活動及應用案例。
- 開源與開發者：開源程式、開發工具、API 及開發者資源。
- 政策與安全：法規、出口管制、漏洞、攻擊及安全事故。
- 投資與產業：融資、收購、股權重組及產業供應鏈。
若一篇涉及多個主題，選擇標題及來源摘錄所描述的核心事件。

headline_zh_hk、summary_zh_hk 及每項 key_facts 必須以香港繁體中文寫成完整易明的句子；不可整句照抄英文標題，不可混用簡體字。官方名稱可保留英文。用「演算法」、「神經網絡」、「數據」等自然用字。保留誰做了甚麼、誰受到影響、否定及不確定語氣，不可倒轉攻擊者與受害者，亦不可把相關性改寫為因果。避免重複詞句；來源未交代的細節直接說明資料不足。`;

export const DIGEST_SYSTEM_PROMPT = `你是香港人工智能新聞編輯。你只可以根據輸入的已驗證新聞摘要編寫每日摘要，使用香港繁體中文（zh-HK），保持中立和事實性。不可加入輸入故事沒有提及的事實、數字、引述、預測或意見。每個 story_ids 必須使用輸入提供的 ID。只輸出符合要求的 JSON，不要 Markdown、前言或程式碼圍欄。

JSON 欄位必須是 headline_zh_hk、intro_zh_hk、sections。sections 是陣列，每項必須包含 category、summary_zh_hk、story_ids。每個 section 的 summary_zh_hk 必須是一句簡短、原創的概述（不超過 100 字），不可只是羅列或重複該分類內文章的標題。每篇故事必須放入與輸入 category 相同的 section，不可重新分類。`;

function bounded(value: string | null, maxLength: number): string | null {
  return value === null ? null : value.trim().slice(0, maxLength);
}

export function buildStoryPrompt(input: StoryPromptInput): string {
  const source = {
    source_name: input.sourceName.trim().slice(0, 160),
    original_title: input.title.trim().slice(0, 500),
    publication_date: bounded(input.publishedAt, 64),
    source_excerpt: bounded(input.excerpt, 4_000),
    canonical_source_url: input.canonicalUrl.trim().slice(0, 2_048),
  };

  return `請整理以下來源資料，並只輸出指定 JSON schema：\n${JSON.stringify(source, null, 2)}`;
}

export function buildDigestPrompt(stories: DigestStoryInput[]): string {
  const input = stories.map((story) => ({
    story_id: story.id,
    headline_zh_hk: story.headline_zh_hk,
    summary_zh_hk: story.summary_zh_hk,
    key_facts: story.key_facts,
    category: story.category,
  }));

  return `請根據以下已驗證故事編寫每日摘要，並只輸出指定 JSON schema。每個 story_ids 只能使用輸入中的 story_id：\n${JSON.stringify(input, null, 2)}`;
}
