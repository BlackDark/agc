import { cdpProvider } from "./claimer.ts";
import { type Config, ConfigError, loadConfig } from "./config.ts";
import { logger } from "./logger.ts";
import { sendNotification } from "./notify.ts";
import { runOnce, startSchedule } from "./scheduler.ts";
import { enabledSites } from "./sites/registry.ts";

const CDP_URL = process.env.CDP_URL ?? "http://localhost:9223";

async function main() {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`config error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const sites = enabledSites(config);
  if (sites.length === 0) {
    logger.warn("no sites enabled — exiting");
    process.exit(0);
  }

  const deps = {
    sites,
    browserProvider: cdpProvider(CDP_URL),
    notify: (results: Awaited<ReturnType<typeof runOnce>>) =>
      sendNotification(results, config!.appriseUrls, config!.notifyOn),
  };

  if (config.runMode === "once") {
    await runOnce(deps);
    return;
  }

  const job = startSchedule(deps, config.cronSchedule!, config.tz);
  const shutdown = (sig: string) => {
    logger.info({ sig }, "shutting down");
    job.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  const s = String(err);
  logger.error({ err: s }, "fatal");
  console.error(`[claimer] FATAL: ${s}`);
  process.exit(1);
});
