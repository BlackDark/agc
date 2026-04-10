import { spawn } from "node:child_process";
import { logger } from "./logger.ts";
import type { ClaimResult, PerItemClaimResult } from "./sites/types.ts";

export type RunResult = { name: string; result: ClaimResult };
export type NotifyEvent = "claimed" | "error" | "login_required" | "nothing";

export function shouldNotify(results: RunResult[], filter: Set<NotifyEvent>): boolean {
  return results.some((r) => filter.has(r.result.status as NotifyEvent));
}

function formatPerItemLines(perItem: PerItemClaimResult[]): string[] {
  const lines: string[] = [];
  for (const p of perItem) {
    const link = p.url ? ` — ${p.url}` : "";
    switch (p.outcome) {
      case "claimed":
        lines.push(`  - claimed: **${p.title}**${link}`);
        break;
      case "already_owned":
        lines.push(`  - already owned: ${p.title}${link}`);
        break;
      case "failed":
        lines.push(`  - failed: ${p.title}${link} — ${p.detail ?? "failed"}`);
        break;
    }
  }
  return lines;
}

export function buildBody(results: RunResult[]): string {
  const lines: string[] = [];
  for (const { name, result } of results) {
    switch (result.status) {
      case "claimed":
        lines.push(`**${name}**: claimed ${result.items.length}`);
        if (result.perItem?.length) {
          lines.push(...formatPerItemLines(result.perItem));
        } else {
          for (const it of result.items) lines.push(`  - ${it}`);
        }
        break;
      case "nothing":
        lines.push(`**${name}**: nothing new to claim`);
        if (result.perItem?.length) {
          lines.push(...formatPerItemLines(result.perItem));
        }
        break;
      case "login_required":
        lines.push(`**${name}**: login required — open the Kasm UI to re-authenticate`);
        if (result.perItem?.length) {
          lines.push("  (progress before logout)");
          lines.push(...formatPerItemLines(result.perItem));
        }
        break;
      case "error":
        lines.push(`**${name}**: error — ${result.error}`);
        if (result.perItem?.length) {
          lines.push(...formatPerItemLines(result.perItem));
        }
        break;
    }
  }
  return lines.join("\n");
}

export async function sendNotification(
  results: RunResult[],
  appriseUrls: string[],
  filter: Set<NotifyEvent>,
): Promise<void> {
  if (appriseUrls.length === 0) {
    logger.debug("notify: no APPRISE_URLS configured, skipping");
    return;
  }
  if (!shouldNotify(results, filter)) {
    logger.debug("notify: no results match NOTIFY_ON filter, skipping");
    return;
  }
  const body = buildBody(results);
  const args = ["-t", "agc", "-b", body, ...appriseUrls];
  await new Promise<void>((resolve) => {
    const proc = spawn("apprise", args, { stdio: "inherit" });
    proc.on("exit", (code) => {
      if (code !== 0) logger.warn({ code }, "apprise exited non-zero");
      resolve();
    });
    proc.on("error", (err) => {
      logger.warn({ err: String(err) }, "failed to spawn apprise");
      resolve();
    });
  });
}
