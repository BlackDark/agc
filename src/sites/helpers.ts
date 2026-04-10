// src/sites/helpers.ts
// Shared helpers for site claimers. Keep these narrow and side-effect-free where possible —
// sites can always inline their own variants when they need site-specific nuance.
import type { Locator, Page } from "playwright-core";
import type { ClaimResult, PerItemClaimResult } from "./types.ts";

/** Thrown by a site claimer when the session has lost its login. Caught at orchestration level. */
export class LoginRequiredError extends Error {
  constructor() {
    super("login_required");
    this.name = "LoginRequiredError";
  }
}

/**
 * Try to dismiss the most common cookie/consent banners (OneTrust, CookieBot, Amazon SP-CC,
 * generic "Accept all"). All clicks are best-effort — failures are swallowed because a missing
 * banner is the happy path, not an error.
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const candidates = [
    "#onetrust-accept-btn-handler",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    'button[data-cel-widget="sp-cc-accept"]',
    'button:has-text("Accept all cookies")',
    'button:has-text("Accept All Cookies")',
    'button:has-text("Accept Cookies")',
    'button:has-text("Accept all")',
    'button:has-text("I Agree")',
  ];
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) {
      await loc.click({ timeout: 5_000 }).catch(() => {});
    }
  }
}

/** Click a locator if it is present; swallow timeouts and element-detached errors. */
export async function clickOptional(locator: Locator, timeout: number): Promise<void> {
  try {
    await locator.first().click({ timeout });
  } catch {
    /* optional step */
  }
}

/**
 * Aggregate a list of per-item outcomes into a single ClaimResult.
 *
 * Rules:
 *   - If any items were claimed, status is `claimed` and `items` lists their titles.
 *   - If nothing was claimed and every item was already owned, status is `nothing`.
 *   - If there are failures, status is `error` with a joined detail string.
 *   - An empty list maps to `nothing`.
 */
export function aggregatePerItemResults(perItem: PerItemClaimResult[]): ClaimResult {
  if (perItem.length === 0) return { status: "nothing" };

  const claimedTitles = perItem.filter((p) => p.outcome === "claimed").map((p) => p.title);
  if (claimedTitles.length > 0) {
    return { status: "claimed", items: claimedTitles, perItem };
  }

  if (perItem.every((p) => p.outcome === "already_owned")) {
    return { status: "nothing", perItem };
  }

  const failed = perItem.filter((p) => p.outcome === "failed");
  if (failed.length > 0) {
    return {
      status: "error",
      error: failed.map((f) => `${f.title}: ${f.detail ?? "failed"}`).join("; "),
      perItem,
    };
  }

  return { status: "nothing", perItem };
}