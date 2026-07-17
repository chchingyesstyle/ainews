import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createSource, getEnabledSources } from "../../src/db/repositories/sources";

describe("source repository", () => {
  it("creates and reads an enabled source", async () => {
    await createSource(env.DB, {
      name: "Example AI",
      publisherUrl: "https://example.com",
      feedUrl: "https://example.com/feed.xml",
      defaultCategory: "模型與研究",
      language: "en",
    });

    await expect(getEnabledSources(env.DB)).resolves.toEqual([
      expect.objectContaining({
        name: "Example AI",
        feed_url: "https://example.com/feed.xml",
        enabled: 1,
      }),
    ]);
  });
});
