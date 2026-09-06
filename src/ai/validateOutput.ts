import type { Category } from "../db/types";
import type { DigestAiOutput, DigestSectionAiOutput, StoryAiOutput } from "./contracts";

export const AI_CATEGORIES: readonly Category[] = [
  "模型與研究",
  "產品與公司",
  "開源與開發者",
  "政策與安全",
  "投資與產業",
];

const MAX_HEADLINE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 1_200;
const MAX_SECTION_SUMMARY_LENGTH = 200;
const MAX_KEY_FACT_LENGTH = 400;
const MAX_ENTITY_LENGTH = 120;
const MAX_ENTITIES = 20;
const MAX_DIGEST_SECTIONS = 5;
const MAX_DIGEST_STORY_IDS = 12;
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainRecord(value: unknown, label: string): PlainRecord {
  if (!isPlainRecord(value)) throw new Error(`${label} must be a plain object`);
  return value;
}

function requiredText(record: PlainRecord, key: string, maxLength: number): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string`);

  const text = value.trim();
  if (text.length === 0) throw new Error(`${key} must not be empty`);
  if (text.length > maxLength) throw new Error(`${key} exceeds ${maxLength} characters`);
  if (HTML_TAG_PATTERN.test(text)) throw new Error(`${key} contains HTML`);
  return text;
}

function categoryValue(record: PlainRecord, key: string): Category {
  const value = record[key];
  if (typeof value !== "string" || !AI_CATEGORIES.includes(value as Category)) {
    throw new Error(`${key} is not an allowed category`);
  }
  return value as Category;
}

function stringArray(
  record: PlainRecord,
  key: string,
  options: { minLength: number; maxLength: number; itemMaxLength: number },
): string[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  if (value.length < options.minLength || value.length > options.maxLength) {
    throw new Error(`${key} must contain between ${options.minLength} and ${options.maxLength} items`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") throw new Error(`${key}[${index}] must be a string`);
    const text = item.trim();
    if (text.length === 0) throw new Error(`${key}[${index}] must not be empty`);
    if (text.length > options.itemMaxLength) {
      throw new Error(`${key}[${index}] exceeds ${options.itemMaxLength} characters`);
    }
    if (HTML_TAG_PATTERN.test(text)) throw new Error(`${key}[${index}] contains HTML`);
    return text;
  });
}

export function validateStoryOutput(value: unknown): StoryAiOutput {
  const record = assertPlainRecord(value, "story output");

  return {
    headline_zh_hk: requiredText(record, "headline_zh_hk", MAX_HEADLINE_LENGTH),
    summary_zh_hk: requiredText(record, "summary_zh_hk", MAX_SUMMARY_LENGTH),
    key_facts: stringArray(record, "key_facts", {
      minLength: 3,
      maxLength: 3,
      itemMaxLength: MAX_KEY_FACT_LENGTH,
    }),
    category: categoryValue(record, "category"),
    named_entities: stringArray(record, "named_entities", {
      minLength: 0,
      maxLength: MAX_ENTITIES,
      itemMaxLength: MAX_ENTITY_LENGTH,
    }),
  };
}

function integerArray(
  record: PlainRecord,
  key: string,
  allowedStoryIds: Set<number>,
  seenStoryIds: Set<number>,
): number[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  if (value.length < 1 || value.length > MAX_DIGEST_STORY_IDS) {
    throw new Error(`${key} must contain between 1 and ${MAX_DIGEST_STORY_IDS} items`);
  }

  return value.map((item, index) => {
    if (!Number.isInteger(item) || !allowedStoryIds.has(item)) {
      throw new Error(`${key}[${index}] is not an allowed story ID`);
    }
    if (seenStoryIds.has(item)) throw new Error(`${key} contains duplicate story IDs`);
    seenStoryIds.add(item);
    return item;
  });
}

function validateDigestSection(
  value: unknown,
  allowedStoryIds: Set<number>,
  seenStoryIds: Set<number>,
): DigestSectionAiOutput {
  const record = assertPlainRecord(value, "digest section");
  return {
    category: categoryValue(record, "category"),
    summary_zh_hk: requiredText(record, "summary_zh_hk", MAX_SECTION_SUMMARY_LENGTH),
    story_ids: integerArray(record, "story_ids", allowedStoryIds, seenStoryIds),
  };
}

export function validateDigestOutput(value: unknown, allowedStoryIds: number[]): DigestAiOutput {
  const record = assertPlainRecord(value, "digest output");
  const allowed = new Set(allowedStoryIds.filter((id) => Number.isInteger(id)));
  const rawSections = record.sections;
  if (!Array.isArray(rawSections)) throw new Error("sections must be an array");
  if (rawSections.length < 1 || rawSections.length > MAX_DIGEST_SECTIONS) {
    throw new Error(`sections must contain between 1 and ${MAX_DIGEST_SECTIONS} items`);
  }

  const seenStoryIds = new Set<number>();
  const sections = rawSections.map((section) =>
    validateDigestSection(section, allowed, seenStoryIds),
  );
  const categories = new Set<Category>();
  for (const section of sections) {
    if (categories.has(section.category)) throw new Error("sections contain duplicate categories");
    categories.add(section.category);
  }

  return {
    headline_zh_hk: requiredText(record, "headline_zh_hk", MAX_HEADLINE_LENGTH),
    intro_zh_hk: requiredText(record, "intro_zh_hk", MAX_SUMMARY_LENGTH),
    sections,
  };
}
