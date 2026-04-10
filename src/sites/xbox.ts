// src/sites/xbox.ts
// Xbox / Microsoft Store — Games with Gold and occasional PC Game Pass giveaways.
// Free games are listed at https://www.xbox.com/en-us/live/gold#gameswithgold and individual
// product pages on microsoft.com. Claiming requires an Xbox Live account session.
//
// Current state: login detection only. Claim flow is TODO — Microsoft's store markup is
// notoriously unstable across locales and A/B tests.
import type { Page } from "playwright-core";
import { dismissCookieBanner } from "./helpers.ts";
import type { ClaimResult, SiteClaimer } from "./types.ts";

export const xbox: SiteClaimer = {
  name: "xbox",
  homeUrl: "https://www.xbox.com/",

  async isLoggedIn(page: Page): Promise<boolean> {
    // Positive signal: "me-control" / account pill in the top nav.
    const account = await page.locator('#mectrl_main_trigger, [data-bi-id="mectrl_main_trigger"]').count();
    if (account > 0) return true;
    // Fallback: "Sign in" link visible in the header.
    const signIn = await page.locator('a:has-text("Sign in")').count();
    return signIn === 0;
  },

  async claim(page: Page): Promise<ClaimResult> {
    await dismissCookieBanner(page);
    // TODO(post-MVP): iterate Games with Gold listings and claim each.
    return { status: "nothing" };
  },
};
