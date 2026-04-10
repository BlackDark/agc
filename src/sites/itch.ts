// src/sites/itch.ts
// itch.io occasionally runs "free for a limited time" sales. The index page
// `https://itch.io/games/newest/on-sale` lists them; "100% off" games can be
// added to the user's library via the "Download or claim" flow.
//
// Current state: login detection only. The per-game claim flow is TODO — on itch
// each free claim pops a modal with "Download and install" which requires navigating
// to the game page, clicking the button, and confirming; selectors shift a lot so
// this is left as a post-MVP enhancement.
import type { Page } from "playwright-core";
import { dismissCookieBanner } from "./helpers.ts";
import type { ClaimResult, SiteClaimer } from "./types.ts";

export const itch: SiteClaimer = {
  name: "itch",
  homeUrl: "https://itch.io/",

  async isLoggedIn(page: Page): Promise<boolean> {
    // Positive signal: the user menu button in the top nav.
    const userMenu = await page.locator(".user_menu_btn, a.user_name").count();
    if (userMenu > 0) return true;
    // Fallback: presence of a "Log in" link.
    const login = await page.locator('a:has-text("Log in"), a[href*="/login"]').count();
    return login === 0;
  },

  async claim(page: Page): Promise<ClaimResult> {
    await dismissCookieBanner(page);
    // TODO(post-MVP): iterate https://itch.io/games/newest/on-sale?price=free for 100%-off games
    // and claim each. For now, no-op so enabling the site doesn't break the run.
    return { status: "nothing" };
  },
};
