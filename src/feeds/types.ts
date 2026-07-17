import type { SourceRecord } from "../db/types";

export interface FeedItem {
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
  items: FeedItem[];
  errors: string[];
}
