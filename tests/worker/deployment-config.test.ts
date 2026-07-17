import { describe, expect, it } from "vitest";

declare global {
  interface ImportMeta {
    glob(pattern: string, options?: Record<string, unknown>): Record<string, unknown>;
  }
}

const files = {
  wrangler: import.meta.glob("../../wrangler.jsonc", { query: "?raw", import: "default", eager: true }),
  workflow: import.meta.glob("../../.github/workflows/deploy.yml", { query: "?raw", import: "default", eager: true }),
};

function file(filesForPattern: Record<string, unknown>): string {
  return String(Object.values(filesForPattern)[0] ?? "");
}

describe("Cloudflare deployment configuration", () => {
  it("declares the Worker, D1, AI, Cron, and assets configuration", () => {
    const config = file(files.wrangler);

    expect(config).toContain('"name": "ainews-hk"');
    expect(config).toContain('"binding": "DB"');
    expect(config).toContain('"binding": "AI"');
    expect(config).toContain('"AI_MODEL_ID": "@cf/meta/llama-3.2-3b-instruct"');
    expect(config).toContain('"0 6 * * *"');
    expect(config).toContain('"directory": "./public"');
    expect(config).toContain("ainews.cchk.uk");
    expect(config).toContain("custom_domain");
  });

  it("uses Cloudflare secrets in GitHub Actions without shell-profile credentials", () => {
    const workflow = file(files.workflow);

    expect(workflow).toContain("push:");
    expect(workflow).toContain("main");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(workflow).not.toContain("GITHUB_PAT");
    expect(workflow).not.toContain(".bashrc");
  });
});
