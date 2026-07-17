import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../../src/env";
import { createSource } from "../../src/db/repositories/sources";
import { runDailyPipeline } from "../../src/pipeline/runDailyPipeline";
import { selectCandidates } from "../../src/pipeline/selectCandidates";
import type { FeedItem } from "../../src/feeds/types";

const makeItem = (
  id: number,
  category: FeedItem["defaultCategory"],
  publishedAt: string,
  title = `Story ${id}`,
): FeedItem => ({
  sourceId: id,
  canonicalUrl: `https://example.com/story-${id}`,
  guid: String(id),
  title,
  excerpt: `Excerpt ${id}`,
  publishedAt,
  titleHash: `title-${id}`,
  defaultCategory: category,
  sourcePriority: id,
});

const testEnv = (ai: Ai): Env => ({
  DB: env.DB,
  AI: ai,
  ADMIN_TOKEN: "test-admin-token",
  PUBLIC_SITE_URL: "https://ainews.cchk.uk",
  AI_MODEL_ID: "@cf/test/model",
  PROMPT_VERSION: "test-v1",
});

async function clearDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM digest_stories"),
    env.DB.prepare("DELETE FROM pipeline_runs"),
    env.DB.prepare("DELETE FROM digests"),
    env.DB.prepare("DELETE FROM stories"),
    env.DB.prepare("DELETE FROM ingested_items"),
    env.DB.prepare("DELETE FROM sources"),
  ]);
}

async function insertStaleItem(sourceId: number, key: string): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO ingested_items
      (source_id, guid, canonical_url, title, source_excerpt, published_at, discovered_at, title_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed')`,
  ).bind(
    sourceId,
    key,
    `https://stale.example/${key}`,
    `Stale ${key}`,
    "Old excerpt",
    "2026-03-01T00:00:00.000Z",
    "2026-03-01T00:00:00.000Z",
    `stale-${key}`,
  ).run();
  return Number(result.meta.last_row_id);
}

function feedXml(sourceId: number, itemCount = 1): string {
  const items = Array.from({ length: itemCount }, (_, index) => {
    const id = sourceId * 100 + index;
    return `<item><guid>${id}</guid><title>AI story ${id}</title><link>https://news.example/story-${id}</link><description>Source excerpt ${id}</description><pubDate>Fri, 17 Jul 2026 05:00:00 GMT</pubDate></item>`;
  }).join("");
  return `<rss><channel>${items}</channel></rss>`;
}

function aiForPipeline(options: { failTitles?: string[]; failDigest?: boolean } = {}): Ai {
  const run = vi.fn(async (_model: string, input: Record<string, unknown>) => {
    const messages = input.messages as Array<{ role: string; content: string }>;
    const content = messages.find((message) => message.role === "user")?.content ?? "";

    if (content.includes("story_id")) {
      if (options.failDigest) throw new Error("mock digest failure");
      const ids = [...content.matchAll(/"story_id": (\d+)/g)].map((match) => Number(match[1]));
      return {
        response: JSON.stringify({
          headline_zh_hk: "今日人工智能焦點",
          intro_zh_hk: "以下內容整理今日已驗證來源的人工智能新聞。",
          sections: [
            {
              category: "模型與研究",
              summary_zh_hk: "研究及產品消息見於下列來源。",
              story_ids: ids,
            },
          ],
        }),
      };
    }

    const title = content.match(/"original_title": "([^"]+)"/)?.[1] ?? "AI news";
    if (options.failTitles?.some((failedTitle) => title.includes(failedTitle))) {
      throw new Error("mock AI failure");
    }

    return {
      response: JSON.stringify({
        headline_zh_hk: title,
        summary_zh_hk: "來源指出相關人工智能進展，詳情以原文為準。",
        key_facts: ["來源已報道相關消息", "資料包括有限背景", "完整內容請參閱原文"],
        category: "模型與研究",
        named_entities: ["AI"],
      }),
    };
  });

  return { run } as unknown as Ai;
}

describe("selectCandidates", () => {
  it("deduplicates URL and title fingerprints, balances categories, and caps results", () => {
    const first = makeItem(1, "模型與研究", "2026-07-17T05:00:00.000Z");
    const items = [
      first,
      makeItem(2, "產品與公司", "2026-07-17T05:00:00.000Z"),
      makeItem(3, "政策與安全", "2026-07-17T05:00:00.000Z"),
      makeItem(4, "開源與開發者", "2026-07-17T04:00:00.000Z"),
      { ...makeItem(5, "投資與產業", "2026-07-17T03:00:00.000Z"), canonicalUrl: first.canonicalUrl },
      { ...makeItem(6, "投資與產業", "2026-07-17T02:00:00.000Z"), titleHash: first.titleHash },
    ];

    const selected = selectCandidates(items, 4);

    expect(selected).toHaveLength(4);
    expect(new Set(selected.map((item) => item.defaultCategory)).size).toBe(4);
    expect(selected.map((item) => item.sourceId)).toEqual([1, 2, 4, 3]);
  });
});

describe("runDailyPipeline", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("publishes stories and one digest without duplicating rows on rerun", async () => {
    await Promise.all(
      [1, 2, 3].map((id) =>
        createSource(env.DB, {
          name: `Source ${id}`,
          publisherUrl: `https://publisher-${id}.example`,
          feedUrl: `https://feeds.example/source-${id}.xml`,
          defaultCategory: "模型與研究",
          language: "en",
        }),
      ),
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
      const sourceId = Number(url.match(/source-(\d+)/)?.[1] ?? 1);
      return new Response(feedXml(sourceId));
    });
    const workerEnv = testEnv(aiForPipeline());

    const first = await runDailyPipeline(workerEnv, {
      date: "2026-07-17",
      fetcher,
    });
    const second = await runDailyPipeline(workerEnv, {
      date: "2026-07-17",
      fetcher,
    });

    expect(first.status).toBe("completed");
    expect(first.storiesPublished).toBe(3);
    expect(first.digestId).not.toBeNull();
    expect(second.storiesPublished).toBe(0);
    expect(second.digestId).toBe(first.digestId);
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM stories").first<{ count: number }>())
      .resolves.toMatchObject({ count: 3 });
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM digests").first<{ count: number }>())
      .resolves.toMatchObject({ count: 1 });
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM pipeline_runs").first<{ count: number }>())
      .resolves.toMatchObject({ count: 1 });
  });

  it("isolates a failed story AI call and publishes a partial digest", async () => {
    await createSource(env.DB, {
      name: "Source 1",
      publisherUrl: "https://publisher.example",
      feedUrl: "https://feeds.example/source-1.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
      return new Response(feedXml(1, 3).replace("AI story 101", "AI story failure"));
    });

    const result = await runDailyPipeline(testEnv(aiForPipeline({ failTitles: ["failure"] })), {
      date: "2026-07-17",
      fetcher,
    });

    expect(result.status).toBe("partial");
    expect(result.storiesPublished).toBe(2);
    expect(result.errors.some((error) => error.includes("mock AI failure"))).toBe(true);
    await expect(env.DB.prepare("SELECT status FROM digests WHERE digest_date = ?").bind("2026-07-17").first<{ status: string }>())
      .resolves.toMatchObject({ status: "partial" });
  });

  it("writes a deterministic partial digest when fewer than three stories are valid", async () => {
    await createSource(env.DB, {
      name: "Source 1",
      publisherUrl: "https://publisher.example",
      feedUrl: "https://feeds.example/source-1.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
      return new Response(feedXml(1, 2));
    });
    const ai = aiForPipeline();

    const result = await runDailyPipeline(testEnv(ai), {
      date: "2026-07-17",
      fetcher,
    });

    expect(result.status).toBe("partial");
    expect(result.storiesPublished).toBe(2);
    const digest = await env.DB.prepare("SELECT * FROM digests WHERE digest_date = ?")
      .bind("2026-07-17")
      .first<{ status: string; intro_zh_hk: string }>();
    expect(digest?.status).toBe("partial");
    expect(digest?.intro_zh_hk).toContain("資料");
    expect((ai as unknown as { run: ReturnType<typeof vi.fn> }).run).toHaveBeenCalledTimes(2);
  });

  it("writes a deterministic partial digest when digest AI output fails validation", async () => {
    await createSource(env.DB, {
      name: "Source 1",
      publisherUrl: "https://publisher.example",
      feedUrl: "https://feeds.example/source-1.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
      return new Response(feedXml(1, 3));
    });

    const result = await runDailyPipeline(testEnv(aiForPipeline({ failDigest: true })), {
      date: "2026-07-17",
      fetcher,
    });

    expect(result.status).toBe("partial");
    expect(result.digestId).not.toBeNull();
    expect(result.errors).toContain("Digest: mock digest failure");
    await expect(env.DB.prepare("SELECT status FROM digests WHERE digest_date = ?").bind("2026-07-17").first<{ status: string }>())
      .resolves.toMatchObject({ status: "partial" });
  });

  it("does not write stories, digests, or run rows during a dry run", async () => {
    await createSource(env.DB, {
      name: "Source 1",
      publisherUrl: "https://publisher.example",
      feedUrl: "https://feeds.example/source-1.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
      return new Response(feedXml(1));
    });

    const result = await runDailyPipeline(testEnv(aiForPipeline()), {
      date: "2026-07-17",
      dryRun: true,
      fetcher,
    });

    expect(result.dryRun).toBe(true);
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM stories").first<{ count: number }>())
      .resolves.toMatchObject({ count: 0 });
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM digests").first<{ count: number }>())
      .resolves.toMatchObject({ count: 0 });
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM pipeline_runs").first<{ count: number }>())
      .resolves.toMatchObject({ count: 0 });
  });

  it("prunes stale unreferenced ingestion rows during a live run", async () => {
    const sourceId = await createSource(env.DB, {
      name: "Source 1",
      publisherUrl: "https://publisher.example",
      feedUrl: "https://feeds.example/source-1.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
    const staleId = await insertStaleItem(sourceId, "live");
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
      return new Response(feedXml(1));
    });

    const result = await runDailyPipeline(testEnv(aiForPipeline()), {
      date: "2026-07-17",
      now: new Date("2026-07-17T06:00:00.000Z"),
      fetcher,
    });

    expect(result.storiesPublished).toBe(1);
    await expect(env.DB.prepare("SELECT id FROM ingested_items WHERE id = ?").bind(staleId).first())
      .resolves.toBeNull();
  });

  it("does not prune ingestion rows during a dry run", async () => {
    const sourceId = await createSource(env.DB, {
      name: "Source 1",
      publisherUrl: "https://publisher.example",
      feedUrl: "https://feeds.example/source-1.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
    const staleId = await insertStaleItem(sourceId, "dry");
    const retentionPruner = vi.fn(async () => 1);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
      return new Response(feedXml(1));
    });

    await runDailyPipeline(testEnv(aiForPipeline()), {
      date: "2026-07-17",
      now: new Date("2026-07-17T06:00:00.000Z"),
      dryRun: true,
      fetcher,
      retentionPruner,
    });

    expect(retentionPruner).not.toHaveBeenCalled();
    await expect(env.DB.prepare("SELECT id FROM ingested_items WHERE id = ?").bind(staleId).first())
      .resolves.toMatchObject({ id: staleId });
  });

  it("continues publishing when retention cleanup fails", async () => {
    const retentionPruner = vi.fn().mockRejectedValue(new Error("maintenance unavailable"));
    await createSource(env.DB, {
      name: "Source 1",
      publisherUrl: "https://publisher.example",
      feedUrl: "https://feeds.example/source-1.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.gdeltproject.org")) return new Response("<rss><channel></channel></rss>");
      return new Response(feedXml(1, 3));
    });

    const result = await runDailyPipeline(testEnv(aiForPipeline()), {
      date: "2026-07-17",
      now: new Date("2026-07-17T06:00:00.000Z"),
      fetcher,
      retentionPruner,
    });

    expect(result.storiesPublished).toBe(3);
    expect(result.digestId).not.toBeNull();
    expect(result.status).toBe("partial");
    expect(result.errors).toContain("Retention cleanup: maintenance unavailable");
    expect(retentionPruner).toHaveBeenCalledTimes(1);
    const [calledDb, cutoff] = retentionPruner.mock.calls[0] ?? [];
    expect(calledDb).toBe(env.DB);
    expect(cutoff).toBe("2026-04-18T06:00:00.000Z");
  });
});
