import type { Env } from "./env";
import { runDailyPipeline } from "./pipeline/runDailyPipeline";
import type { PipelineOptions, PipelineResult } from "./pipeline/runDailyPipeline";

export type ScheduledPipelineRunner = (
  env: Env,
  options?: PipelineOptions,
) => Promise<PipelineResult>;

export function scheduledHandler(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
  runPipeline: ScheduledPipelineRunner = runDailyPipeline,
): void {
  const date = new Date(controller.scheduledTime).toISOString().slice(0, 10);
  ctx.waitUntil(runPipeline(env, { date }));
}
