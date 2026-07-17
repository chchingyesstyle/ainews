import type { SourceRecord } from "../db/types";
import { parseFeed } from "./parseFeed";
import type { CollectionResult, FeedItem } from "./types";

export type FeedFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 8_000;
const BATCH_SIZE = 5;

const GDELT_SOURCE: SourceRecord = {
  id: 0,
  name: "GDELT",
  publisher_url: "https://www.gdeltproject.org",
  feed_url: "https://api.gdeltproject.org/api/v2/doc/doc",
  default_category: "模型與研究",
  language: "multi",
  enabled: 1,
  last_fetched_at: null,
  failure_count: 0,
  created_at: "1970-01-01T00:00:00.000Z",
  updated_at: "1970-01-01T00:00:00.000Z",
};

async function fetchText(url: string, fetcher: FeedFetcher): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "user-agent": "ainews.cchk.uk/1.0 feed collector",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function collectOne(
  source: SourceRecord,
  fetcher: FeedFetcher,
): Promise<{ source: SourceRecord; items: FeedItem[]; error: string | null }> {
  try {
    const xml = await fetchText(source.feed_url, fetcher);
    return { source, items: parseFeed(xml, source), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown feed error";
    return { source, items: [], error: message };
  }
}

export async function collectFromFeeds(
  sources: SourceRecord[],
  fetcher: FeedFetcher = fetch,
): Promise<CollectionResult> {
  const items: FeedItem[] = [];
  const errors: string[] = [];
  let feedsSucceeded = 0;

  for (let index = 0; index < sources.length; index += BATCH_SIZE) {
    const batch = sources.slice(index, index + BATCH_SIZE);
    const results = await Promise.all(batch.map((source) => collectOne(source, fetcher)));
    for (const result of results) {
      if (result.error) {
        errors.push(result.source.name + ": " + result.error);
      } else {
        feedsSucceeded += 1;
        items.push(...result.items);
      }
    }
  }

  return {
    feedsAttempted: sources.length,
    feedsSucceeded,
    items,
    errors,
  };
}

export async function collectFromGdelt(
  query: string,
  fetcher: FeedFetcher = fetch,
): Promise<FeedItem[]> {
  const url = new URL(GDELT_SOURCE.feed_url);
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "rss");
  url.searchParams.set("timespan", "24h");
  url.searchParams.set("maxrecords", "50");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("dropdup", "true");

  const xml = await fetchText(url.toString(), fetcher);
  return parseFeed(xml, GDELT_SOURCE);
}
