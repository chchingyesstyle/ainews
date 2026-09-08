import { env } from "cloudflare:test";
import { vi, describe, expect, it, beforeEach } from "vitest";
import { RETRY_CRON, scheduledHandler, type ScheduledPipelineRunner } from "../../src/scheduled";

const mockedRun = vi.hoisted(() => vi.fn());

describe("scheduled handler", () => {
  beforeEach(() => mockedRun.mockReset().mockResolvedValue({ status: "completed" }));

  it("passes the controller UTC date to the daily pipeline", async () => {
    const waitUntil = vi.fn();
    scheduledHandler(
      { scheduledTime: Date.parse("2026-07-18T05:30:00.000Z") } as ScheduledController,
      env,
      { waitUntil } as unknown as ExecutionContext,
      mockedRun as unknown as ScheduledPipelineRunner,
    );

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(mockedRun).toHaveBeenCalledWith(env, { date: "2026-07-18" });
  });

  it("runs a retry-only pass for the recovery cron", async () => {
    const waitUntil = vi.fn();
    scheduledHandler(
      {
        scheduledTime: Date.parse("2026-07-18T05:30:00.000Z"),
        cron: RETRY_CRON,
      } as ScheduledController,
      env,
      { waitUntil } as unknown as ExecutionContext,
      mockedRun as unknown as ScheduledPipelineRunner,
    );

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(mockedRun).toHaveBeenCalledWith(env, { date: "2026-07-18", retryFailedOnly: true });
  });
});
