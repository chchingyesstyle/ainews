import type { Category } from "../db/types";
import type { FeedItem } from "../feeds/types";

const CATEGORY_ORDER: readonly Category[] = [
  "模型與研究",
  "產品與公司",
  "開源與開發者",
  "政策與安全",
  "投資與產業",
];

function compareItems(left: FeedItem, right: FeedItem): number {
  const priorityDifference = (left.sourcePriority ?? Number.MAX_SAFE_INTEGER) -
    (right.sourcePriority ?? Number.MAX_SAFE_INTEGER);
  if (priorityDifference !== 0) return priorityDifference;

  const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
  const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER);
}

export function selectCandidates(items: FeedItem[], limit = 12): FeedItem[] {
  if (limit <= 0 || items.length === 0) return [];

  const ordered = [...items].sort(compareItems);
  const seenUrls = new Set<string>();
  const seenTitleHashes = new Set<string>();
  const unique: FeedItem[] = [];

  for (const item of ordered) {
    if (seenUrls.has(item.canonicalUrl) || seenTitleHashes.has(item.titleHash)) continue;
    seenUrls.add(item.canonicalUrl);
    seenTitleHashes.add(item.titleHash);
    unique.push(item);
  }

  const buckets = new Map<Category, FeedItem[]>();
  for (const category of CATEGORY_ORDER) buckets.set(category, []);
  for (const item of unique) {
    const category = item.defaultCategory ?? "模型與研究";
    const bucket = buckets.get(category) ?? buckets.get("模型與研究");
    bucket?.push(item);
  }

  const selected: FeedItem[] = [];
  while (selected.length < limit) {
    let addedInRound = false;
    for (const category of CATEGORY_ORDER) {
      const item = buckets.get(category)?.shift();
      if (!item) continue;
      selected.push(item);
      addedInRound = true;
      if (selected.length === limit) break;
    }
    if (!addedInRound) break;
  }

  return selected;
}
