import { Hono } from "hono";

import type { Env } from "../env";
import { runDailyPipeline } from "../pipeline/runDailyPipeline";
import type { PipelineOptions, PipelineResult } from "../pipeline/runDailyPipeline";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PipelineRunner = (env: Env, options?: PipelineOptions) => Promise<PipelineResult>;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

export function createAdminRoutes(runPipeline: PipelineRunner = runDailyPipeline) {
  const admin = new Hono<{ Bindings: Env }>();

  admin.all("/run", async (c) => {
    if (c.req.method !== "POST") return c.json({ error: "Method not allowed" }, 405);
    const configuredToken = c.env.ADMIN_TOKEN;
    const authorization = c.req.header("Authorization");
    if (!configuredToken || authorization !== `Bearer ${configuredToken}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Malformed JSON" }, 400);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "Request body must be an object" }, 400);
    }

    const input = body as { date?: unknown; dryRun?: unknown; retryFailedOnly?: unknown };
    if (input.date !== undefined && !validDate(input.date)) {
      return c.json({ error: "Invalid date" }, 400);
    }
    if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
      return c.json({ error: "dryRun must be boolean" }, 400);
    }
    if (input.retryFailedOnly !== undefined && typeof input.retryFailedOnly !== "boolean") {
      return c.json({ error: "retryFailedOnly must be boolean" }, 400);
    }

    try {
      const result = await runPipeline(c.env, {
        ...(input.date === undefined ? {} : { date: input.date }),
        ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
        ...(input.retryFailedOnly === undefined ? {} : { retryFailedOnly: input.retryFailedOnly }),
      });
      return c.json(result, result.status === "failed" ? 500 : 200);
    } catch {
      return c.json({ error: "Pipeline execution failed" }, 500);
    }
  });

  return admin;
}
