import type { Category } from "../db/types";

export interface StoryAiOutput {
  headline_zh_hk: string;
  summary_zh_hk: string;
  key_facts: string[];
  category: Category;
  named_entities: string[];
}

export interface DigestSectionAiOutput {
  category: Category;
  summary_zh_hk: string;
  story_ids: number[];
}

export interface DigestAiOutput {
  headline_zh_hk: string;
  intro_zh_hk: string;
  sections: DigestSectionAiOutput[];
}

export interface DigestStoryInput {
  id: number;
  headline_zh_hk: string;
  summary_zh_hk: string;
  key_facts: string[];
  category: Category;
}
