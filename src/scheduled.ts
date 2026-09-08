import type { Env } from "./env";
import { runDailyPipeline } from "./pipeline/runDailyPipeline";
import type { PipelineOptions, PipelineResult } from "./pipeline/runDailyPipeline";

export type ScheduledPipelineRunner = (
  env: Env,
  options?: PipelineOptions,
) => Promise<PipelineResult>;

export const DAILY_CRON = "0 6 * * *";
export const RETRY_CRON = "30 6 * * *";

export function scheduledHandler(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
  runPipeline: ScheduledPipelineRunner = runDailyPipeline,
): void {
  const date = new Date(controller.scheduledTime).toISOString().slice(0, 10);
  const options: PipelineOptions = { date };
  if (controller.cron === RETRY_CRON) options.retryFailedOnly = true;
  ctx.waitUntil(runPipeline(env, options));
}
