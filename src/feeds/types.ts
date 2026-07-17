import type { Category, SourceRecord } from "../db/types";

export interface FeedItem {
  id?: number;
  sourceName?: string;
  sourcePriority?: number;
  defaultCategory?: Category;
  sourceId: number;
  guid: string | null;
  canonicalUrl: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  titleHash: string;
}

export interface CollectedFeed {
  source: SourceRecord;
  items: FeedItem[];
  error: string | null;
}

export interface CollectionResult {
  feedsAttempted: number;
  feedsSucceeded: number;
  succeededSourceIds: number[];
  failedSourceIds: number[];
  items: FeedItem[];
  errors: string[];
}
