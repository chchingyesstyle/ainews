import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminRoutes, type PipelineRunner } from "../../src/routes/adminFactory";

const mockedRun = vi.hoisted(() => vi.fn());

const adminApp = createAdminRoutes(mockedRun as unknown as PipelineRunner);

const request = (method: string, body?: string, token?: string): Request =>
  new Request("https://ainews.cchk.uk/run", {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

const adminEnv = {
  ...env,
  ADMIN_TOKEN: "secret-token",
  PUBLIC_SITE_URL: "https://ainews.cchk.uk",
  AI_MODEL_ID: "@cf/test/model",
  PROMPT_VERSION: "test-v1",
};

describe("POST /admin/run", () => {
  beforeEach(() => mockedRun.mockReset().mockResolvedValue({ status: "completed", dryRun: false }));

  it("rejects missing or incorrect bearer tokens", async () => {
    const missing = await adminApp.fetch(request("POST", "{}"), adminEnv);
    const incorrect = await adminApp.fetch(request("POST", "{}", "wrong"), adminEnv);

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it("rejects non-POST requests and malformed input", async () => {
    const method = await adminApp.fetch(request("GET", undefined, "secret-token"), adminEnv);
    const json = await adminApp.fetch(request("POST", "not-json", "secret-token"), adminEnv);
    const date = await adminApp.fetch(
      request("POST", JSON.stringify({ date: "17-07-2026" }), "secret-token"),
      adminEnv,
    );

    expect(method.status).toBe(405);
    expect(json.status).toBe(400);
    expect(date.status).toBe(400);
  });

  it("runs a validated date and supports dryRun", async () => {
    const response = await adminApp.fetch(
      request("POST", JSON.stringify({ date: "2026-07-17", dryRun: true }), "secret-token"),
      adminEnv,
    );

    expect(response.status).toBe(200);
    expect(mockedRun).toHaveBeenCalledWith(adminEnv, { date: "2026-07-17", dryRun: true });
  });

  it("supports an authenticated retry-only run", async () => {
    const response = await adminApp.fetch(
      request("POST", JSON.stringify({ date: "2026-07-17", retryFailedOnly: true }), "secret-token"),
      adminEnv,
    );

    expect(response.status).toBe(200);
    expect(mockedRun).toHaveBeenCalledWith(adminEnv, { date: "2026-07-17", retryFailedOnly: true });
  });
});
