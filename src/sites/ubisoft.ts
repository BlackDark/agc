// src/sites/ubisoft.ts
// Ubisoft Connect occasionally gives away full games during seasonal events (e.g. Ubisoft Forward).
// The giveaway page is https://store.ubisoft.com/ — a carousel/banner appears during events.
//
// Current state: login detection only. Claim flow is TODO — Ubisoft's store uses a CMS-driven
// layout, so selectors need to be captured from a live giveaway and are left post-MVP.
import type { Page } from "playwright-core";
import { dismissCookieBanner } from "./helpers.ts";
import type { ClaimResult, SiteClaimer } from "./types.ts";

export const ubisoft: SiteClaimer = {
  name: "ubisoft",
  homeUrl: "https://store.ubisoft.com/",

  async isLoggedIn(page: Page): Promise<boolean> {
    // Positive signal: account menu button in the header.
    const account = await page.locator('[data-testid="header-account-button"], [aria-label*="Account" i]').count();
    if (account > 0) return true;
    // Fallback: Sign in link present.
    const signIn = await page.locator('a:has-text("Sign in"), a:has-text("Log in")').count();
    return signIn === 0;
  },

  async claim(page: Page): Promise<ClaimResult> {
    await dismissCookieBanner(page);
    // TODO(post-MVP): detect "Get it free" banner/product card, navigate to the product page,
    // click the Get It Free button and confirm ownership.
    return { status: "nothing" };
  },
};
