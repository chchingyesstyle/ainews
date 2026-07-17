export type Category =
  | "模型與研究"
  | "產品與公司"
  | "開源與開發者"
  | "政策與安全"
  | "投資與產業";

export interface SourceRecord {
  id: number;
  name: string;
  publisher_url: string;
  feed_url: string;
  default_category: Category;
  language: string;
  enabled: number;
  last_fetched_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface NewSource {
  name: string;
  publisherUrl: string;
  feedUrl: string;
  defaultCategory: Category;
  language: string;
}

export interface IngestedItemRecord {
  id: number;
  source_id: number;
  guid: string | null;
  canonical_url: string;
  title: string;
  source_excerpt: string | null;
  published_at: string | null;
  discovered_at: string;
  title_hash: string;
  status: "new" | "selected" | "published" | "rejected" | "failed";
  last_error: string | null;
}

export interface NewIngestedItem {
  sourceId: number;
  guid: string | null;
  canonicalUrl: string;
  title: string;
  sourceExcerpt: string | null;
  publishedAt: string | null;
  discoveredAt: string;
  titleHash: string;
}

export interface StoryRecord {
  id: number;
  ingested_item_id: number;
  slug: string;
  headline_zh_hk: string;
  summary_zh_hk: string;
  key_facts_json: string;
  category: Category;
  named_entities_json: string;
  source_name: string;
  source_url: string;
  source_published_at: string | null;
  published_at: string | null;
  status: "published" | "failed" | "hidden";
  model_id: string;
  prompt_version: string;
  created_at: string;
  updated_at: string;
}

export interface NewStory {
  ingestedItemId: number;
  slug: string;
  headlineZhHk: string;
  summaryZhHk: string;
  keyFacts: string[];
  category: Category;
  namedEntities: string[];
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  publishedAt: string;
  status: "published" | "failed" | "hidden";
  modelId: string;
  promptVersion: string;
}

export interface DigestRecord {
  id: number;
  digest_date: string;
  headline_zh_hk: string;
  intro_zh_hk: string;
  sections_json: string;
  status: "published" | "partial" | "failed";
  model_id: string;
  prompt_version: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewDigest {
  digestDate: string;
  headlineZhHk: string;
  introZhHk: string;
  sections: Array<{ category: Category; summaryZhHk: string; storyIds: number[] }>;
  status: "published" | "partial" | "failed";
  modelId: string;
  promptVersion: string;
  publishedAt: string | null;
}

export interface RunResult {
  status: "completed" | "partial" | "failed";
  feedsAttempted: number;
  feedsSucceeded: number;
  itemsDiscovered: number;
  storiesSelected: number;
  storiesPublished: number;
  digestId: number | null;
  errors: string[];
}
