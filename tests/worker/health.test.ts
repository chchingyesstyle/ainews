import { describe, expect, it } from "vitest";
import { healthPayload } from "../../src/routes/health";

describe("healthPayload", () => {
  it("returns an ok payload with database and last-run fields", () => {
    expect(healthPayload("ok", null)).toEqual({
      ok: true,
      database: "ok",
      lastRun: null,
    });
  });
});
