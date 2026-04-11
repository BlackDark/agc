// src/sites/gog.ts
// GOG.com periodically runs a giveaway ("Claim it now!") that shows a banner on the homepage.
// When there is no active giveaway, there's simply no banner.
//
// Flow:
//   1. Navigate to https://www.gog.com/
//   2. Dismiss cookie banner if present.
//   3. Check for the giveaway banner (`.giveaway` / `giveaway-banner`).
//   4. If present, click its "Claim it" button. GOG finalizes the claim via an XHR and flips the
//      banner into "Success" / "Claimed" state, or redirects to the product page.
import type { Page } from "playwright-core";
import { logger } from "../logger.ts";
import { dismissCookieBanner } from "./helpers.ts";
import type { ClaimResult, SiteClaimer } from "./types.ts";

const GOG_TIMEOUTS = {
  navigation: 60_000,
  bannerVisible: 10_000,
  postClick: 30_000,
} as const;

async function gogIsLoggedIn(page: Page): Promise<boolean> {
  // Positive signal: account menu button. This attribute is more stable than the old
  // `#menuUsername` id (which GOG removed in early 2026).
  const accountMenu = await page.locator('[hook-test="menuAccountButton"]').count();
  if (accountMenu > 0) return true;
  // Fallback negative signal: presence of the "Sign in" link.
  const signIn = await page.locator('a:has-text("Sign in")').count();
  return signIn === 0;
}

export const gog: SiteClaimer = {
  name: "gog",
  homeUrl: "https://www.gog.com/",

  async isLoggedIn(page: Page): Promise<boolean> {
    return gogIsLoggedIn(page);
  },

  async claim(page: Page): Promise<ClaimResult> {
    page.setDefaultNavigationTimeout(GOG_TIMEOUTS.navigation);
    page.setDefaultTimeout(15_000);

    try {
      await page.goto("https://www.gog.com/", {
        waitUntil: "domcontentloaded",
        timeout: GOG_TIMEOUTS.navigation,
      });
      await dismissCookieBanner(page);

      if (!(await gogIsLoggedIn(page))) {
        return { status: "login_required" };
      }

      // Giveaway banner locators (GOG has changed these several times).
      const banner = page.locator('.giveaway, giveaway-banner, [href*="giveaway"]').first();
      const hasBanner = await banner
        .waitFor({ state: "visible", timeout: GOG_TIMEOUTS.bannerVisible })
        .then(() => true)
        .catch(() => false);

      if (!hasBanner) {
        logger.info("gog: no active giveaway");
        return { status: "nothing" };
      }

      // Title is usually inside `.giveaway__overlay-wrapper` or the banner's alt text.
      const title =
        (
          await page
            .locator(".giveaway__title, giveaway-banner h1")
            .first()
            .innerText()
            .catch(() => "")
        ).trim() || "GOG giveaway";

      // "Claimed" / "Yes, and claim the game" button.
      const claimBtn = page
        .locator('.giveaway__button, button:has-text("Claim it"), button:has-text("Yes, and claim")')
        .first();

      if (!(await claimBtn.isVisible().catch(() => false))) {
        logger.info({ title }, "gog: giveaway banner present but no claim button (likely already owned)");
        return {
          status: "nothing",
          perItem: [{ title, url: page.url(), outcome: "already_owned" }],
        };
      }

      await claimBtn.click({ timeout: GOG_TIMEOUTS.postClick });
      await page.waitForTimeout(2_000);

      logger.info({ title }, "gog: claimed giveaway");
      return {
        status: "claimed",
        items: [title],
        perItem: [{ title, url: page.url(), outcome: "claimed" }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error({ err: msg }, "gog: claim run failed");
      return { status: "error", error: msg };
    }
  },
};
