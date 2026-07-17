import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      AI: Ai;
      ADMIN_TOKEN?: string;
      ASSETS?: Fetcher;
      PUBLIC_SITE_URL: string;
      AI_MODEL_ID: string;
      PROMPT_VERSION: string;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
