import { Cron } from "croner";
import { logger } from "./logger.ts";
import { runClaim, type BrowserProvider } from "./claimer.ts";
import type { RunResult } from "./notify.ts";
import type { SiteClaimer } from "./sites/types.ts";

export type SchedulerDeps = {
  sites: SiteClaimer[];
  browserProvider: BrowserProvider;
  notify: (results: RunResult[]) => Promise<void>;
};

export async function runOnce(deps: SchedulerDeps): Promise<RunResult[]> {
  logger.info("tick start");
  let results: RunResult[];
  try {
    results = await runClaim(deps.sites, deps.browserProvider);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "tick failed at top level");
    console.error(`[claimer] TICK FAILED (top level): ${msg}`);
    results = [{ name: "_runtime", result: { status: "error", error: msg } }];
  }
  try {
    await deps.notify(results);
  } catch (err) {
    const s = String(err);
    logger.error({ err: s }, "notify failed");
    console.error(`[claimer] NOTIFY FAILED: ${s}`);
  }
  const summary = results.map((r) => ({ name: r.name, status: r.result.status }));
  logger.info({ results: summary }, "tick done");
  const bad = results.filter((r) => r.result.status === "error" || r.name === "_runtime");
  if (bad.length > 0) {
    console.error(`[claimer] tick done with errors: ${JSON.stringify(summary)}`);
  }
  return results;
}

export function startSchedule(
  deps: SchedulerDeps,
  cronExpr: string,
  tz: string,
): Cron {
  logger.info({ cronExpr, tz }, "scheduler started");
  return new Cron(cronExpr, { timezone: tz, protect: true }, async () => {
    await runOnce(deps);
  });
}
