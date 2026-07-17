import type { DigestStoryInput } from "./contracts";

export interface StoryPromptInput {
  sourceName: string;
  title: string;
  publishedAt: string | null;
  excerpt: string | null;
  canonicalUrl: string;
}

export const STORY_SYSTEM_PROMPT = `你是香港人工智能新聞編輯。請以香港繁體中文（zh-HK）整理提供的單一來源資料，保持中立、準確、簡潔。只可使用輸入資料，不可補充未提供的事實，不可創作數字、引述、因果關係或評論；資料不足時要明確表示不確定。保留必要的官方英文名稱。只輸出符合要求的 JSON，不要 Markdown、前言或程式碼圍欄。

JSON 欄位必須是 headline_zh_hk、summary_zh_hk、key_facts、category、named_entities。key_facts 必須正好有三項。category 必須是「模型與研究」、「產品與公司」、「開源與開發者」、「政策與安全」、「投資與產業」其中之一。`;

export const DIGEST_SYSTEM_PROMPT = `你是香港人工智能新聞編輯。你只可以根據輸入的已驗證新聞摘要編寫每日摘要，使用香港繁體中文（zh-HK），保持中立和事實性。不可加入輸入故事沒有提及的事實、數字、引述、預測或意見。每個 story_ids 必須使用輸入提供的 ID。只輸出符合要求的 JSON，不要 Markdown、前言或程式碼圍欄。`;

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
