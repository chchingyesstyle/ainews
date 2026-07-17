import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("D1 schema", () => {
  it("contains the required content and pipeline tables", async () => {
    const result = await env.DB
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name",
      )
      .all<{ name: string }>();

    expect(result.results.map((row) => row.name)).toEqual([
      "digest_stories",
      "digests",
      "ingested_items",
      "pipeline_runs",
      "sources",
      "stories",
    ]);
  });

  it("enforces the canonical URL, slug, digest date, and pair uniqueness rules", async () => {
    const tableSql = await env.DB
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('ingested_items', 'stories', 'digests', 'digest_stories') ORDER BY name",
      )
      .all<{ name: string; sql: string }>();

    const sql = tableSql.results.map((row) => row.sql).join("\n");
    expect(sql).toContain("canonical_url");
    expect(sql).toContain("UNIQUE");
    expect(sql).toContain("digest_date");
    expect(sql).toContain("PRIMARY KEY (digest_id, story_id)");
  });
});
