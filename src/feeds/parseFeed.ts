import { XMLParser } from "fast-xml-parser";
import type { SourceRecord } from "../db/types";
import { normalizeUrl } from "./normalizeUrl";
import { titleFingerprint } from "./titleFingerprint";
import type { FeedItem } from "./types";

const MAX_FEED_BYTES = 512_000;
const MAX_EXCERPT_LENGTH = 4_000;

function asText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text || null;
  }

  if (value && typeof value === "object" && "#text" in value) {
    return asText((value as { "#text": unknown })["#text"]);
  }

  return null;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function stripMarkup(value: string | null): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EXCERPT_LENGTH);
  return text || null;
}

function isoDate(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function atomLink(value: unknown): string | null {
  const links = asArray(value as Record<string, unknown> | Record<string, unknown>[]);
  const alternate =
    links.find((link) => !link["@_rel"] || link["@_rel"] === "alternate") ?? links[0];
  if (!alternate) return null;
  return typeof alternate === "string"
    ? alternate
    : asText(alternate["@_href"]);
}

export function parseFeed(xml: string, source: SourceRecord): FeedItem[] {
  if (new TextEncoder().encode(xml).byteLength > MAX_FEED_BYTES) {
    throw new Error("feed exceeds maximum size");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: false,
  });
  const document = parser.parse(xml) as Record<string, unknown>;
  const rssItems = asArray(
    (document.rss as Record<string, unknown> | undefined)?.channel &&
      ((document.rss as Record<string, unknown>).channel as Record<string, unknown>).item,
  );
  const atomItems = asArray((document.feed as Record<string, unknown> | undefined)?.entry);

  return [...rssItems.map((item) => parseRssItem(item, source)), ...atomItems.map((item) => parseAtomItem(item, source))]
    .filter((item): item is FeedItem => item !== null);
}

function buildItem(
  source: SourceRecord,
  guid: string | null,
  url: string | null,
  title: string | null,
  excerpt: string | null,
  publishedAt: string | null,
): FeedItem | null {
  const canonicalUrl = url ? normalizeUrl(url) : "";
  const cleanTitle = title?.trim() ?? "";
  if (!canonicalUrl || !cleanTitle) return null;

  return {
    sourceId: source.id,
    guid,
    canonicalUrl,
    title: cleanTitle,
    excerpt: stripMarkup(excerpt),
    publishedAt,
    titleHash: titleFingerprint(cleanTitle),
  };
}

function parseRssItem(item: unknown, source: SourceRecord): FeedItem | null {
  const value = (item ?? {}) as Record<string, unknown>;
  return buildItem(
    source,
    asText(value.guid),
    asText(value.link),
    asText(value.title),
    asText(value.description),
    isoDate(value.pubDate ?? value.published ?? value.updated),
  );
}

function parseAtomItem(item: unknown, source: SourceRecord): FeedItem | null {
  const value = (item ?? {}) as Record<string, unknown>;
  return buildItem(
    source,
    asText(value.id),
    atomLink(value.link),
    asText(value.title),
    asText(value.summary ?? value.content),
    isoDate(value.updated ?? value.published),
  );
}
