// src/sites/gog-redeem.ts
// Redeem a GOG key (typically received from Prime Gaming) on gog.com.
//
// Flow is ported from P-Adamiec/free-games-claimer enhanced branch, commit b5dfbbdf:
//   1. Open `https://www.gog.com/redeem/<code>` in a new tab.
//   2. Listen for responses from `https://redeem.gog.com/` — these carry JSON with
//      `reason`/`reason2` = captcha | code_used | code_not_found.
//   3. Click "Continue" (validates the code). If the network response classified it
//      as captcha / code_used / code_not_found, bail out with that reason.
//   4. Otherwise click "Redeem" and wait for `.success-message`.
//
// We do NOT automate GOG login — if the redirect lands on login.gog.com we simply
// return `login_required` so the user can finish it manually in the Kasm UI; the
// next scheduled tick will retry.
import type { BrowserContext, Page } from "playwright-core";
import { logger } from "../logger.ts";

export type RedeemOutcome =
  | { status: "redeemed" }
  | { status: "already_used" }
  | { status: "code_not_found" }
  | { status: "captcha" }
  | { status: "login_required" }
  | { status: "error"; error: string };

const REDEEM_TIMEOUTS = {
  navigation: 60_000,
  buttonVisible: 15_000,
  responseWait: 15_000,
} as const;

export type ClassifiedReason = "captcha" | "code_used" | "code_not_found" | null;

/**
 * Pure classifier for a `redeem.gog.com` JSON body. Kept exported and side-effect-free so it can
 * be unit-tested without a browser.
 */
export function classifyRedeemResponseBody(text: string): ClassifiedReason {
  let json: { reason?: string; reason2?: string };
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const r1 = json.reason ?? "";
  const r2 = json.reason2 ?? "";
  if (r1.includes("captcha") || r2.includes("captcha")) return "captcha";
  if (r1 === "code_used" || r2 === "code_used") return "code_used";
  if (r1 === "code_not_found" || r2 === "code_not_found") return "code_not_found";
  return null;
}

async function classifyFromResponses(page: Page): Promise<() => ClassifiedReason> {
  let reason: ClassifiedReason = null;
  page.on("response", async (r) => {
    if (!r.url().startsWith("https://redeem.gog.com/")) return;
    try {
      const text = await r.text();
      const classified = classifyRedeemResponseBody(text);
      if (classified) reason = classified;
    } catch {
      /* response body unavailable — ignore */
    }
  });
  return () => reason;
}

export async function redeemGogCode(context: BrowserContext, code: string): Promise<RedeemOutcome> {
  const page = await context.newPage();
  try {
    const getReason = await classifyFromResponses(page);

    await page.goto(`https://www.gog.com/redeem/${encodeURIComponent(code)}`, {
      waitUntil: "networkidle",
      timeout: REDEEM_TIMEOUTS.navigation,
    });

    if (page.url().startsWith("https://login.gog.com/")) {
      logger.warn({ code }, "gog-redeem: not logged in to GOG");
      return { status: "login_required" };
    }

    // Step 1: Continue (validates the code).
    const continueBtn = page.locator('button[type="submit"].button.primary:has-text("Continue")').first();
    try {
      await continueBtn.waitFor({ state: "visible", timeout: REDEEM_TIMEOUTS.buttonVisible });
      await continueBtn.click();
      await page.waitForTimeout(1_500);
    } catch {
      /* no continue button — maybe immediate Redeem screen */
    }

    // UI-level fallback: check the warning banner even if no JSON response arrived.
    const warning = page.locator(".warning-message").first();
    if (await warning.isVisible().catch(() => false)) {
      const text = (await warning.innerText().catch(() => "")).toLowerCase();
      if (text.includes("already used")) return { status: "already_used" };
    }

    const classified = getReason();
    if (classified === "captcha") return { status: "captcha" };
    if (classified === "code_used") return { status: "already_used" };
    if (classified === "code_not_found") return { status: "code_not_found" };

    // Step 2: Redeem.
    const redeemBtn = page.locator('button[type="submit"].button.primary:has-text("Redeem")').first();
    await redeemBtn.waitFor({ state: "visible", timeout: REDEEM_TIMEOUTS.buttonVisible });
    await redeemBtn.click();
    await page.waitForTimeout(2_000);

    const afterRedeem = getReason();
    if (afterRedeem === "captcha") return { status: "captcha" };
    if (afterRedeem === "code_used") return { status: "already_used" };

    try {
      await page.waitForSelector('.success-message, h1:has-text("Code redeemed successfully!")', {
        state: "visible",
        timeout: REDEEM_TIMEOUTS.buttonVisible,
      });
      logger.info({ code }, "gog-redeem: redeemed successfully");
      return { status: "redeemed" };
    } catch (e) {
      return {
        status: "error",
        error: `no success indicator after Redeem click: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  } finally {
    await page.close().catch(() => {});
  }
}
