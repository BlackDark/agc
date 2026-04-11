// src/sites/aliexpress.ts
// AliExpress daily coin collection.
//
// The coin page is part of the AliExpress mobile experience — the desktop site shows an
// "install the app" wall, so we MUST drive the page as a mobile device. We can't change the
// context's User-Agent because the claimer connects to an existing Chromium session over CDP
// (the user's persistent Kasm profile). Instead we override UA + viewport per-page via a
// raw CDP session, which affects subsequent navigations on that page only.
//
// Flow:
//   1. Apply mobile emulation on the page (once).
//   2. Navigate to the coin page.
//   3. If `.login-page-container` is present, bail as login_required.
//   4. Read `#signButton`'s class list:
//      - contains `aecoin-checkInButton-*` → claimable, click to collect
//      - otherwise → already collected today, nothing to do.
import type { Page } from "playwright-core";
import { logger } from "../logger.ts";
import { LoginRequiredError } from "./helpers.ts";
import type { ClaimResult, SiteClaimer } from "./types.ts";

const AE_TIMEOUTS = {
  navigation: 90_000,
  elementVisible: 30_000,
  postClick: 3_000,
} as const;

const COIN_URL = "https://m.aliexpress.com/p/coin-pc-index/index.html";

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";

// Per-page flag: CDP emulation overrides persist for the page's lifetime, so we only apply once.
const emulatedPages = new WeakSet<Page>();

async function ensureMobileEmulation(page: Page): Promise<void> {
  if (emulatedPages.has(page)) return;
  const client = await page.context().newCDPSession(page);
  await client.send("Network.setUserAgentOverride", {
    userAgent: MOBILE_UA,
    acceptLanguage: "en-US,en;q=0.9",
    platform: "Android",
    userAgentMetadata: {
      brands: [
        { brand: "Not A(Brand", version: "99" },
        { brand: "Google Chrome", version: "122" },
        { brand: "Chromium", version: "122" },
      ],
      fullVersion: "122.0.6261.105",
      platform: "Android",
      platformVersion: "13",
      architecture: "",
      model: "Pixel 7",
      mobile: true,
    },
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 412,
    height: 915,
    deviceScaleFactor: 3,
    mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 },
  });
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  emulatedPages.add(page);
}

async function gotoCoinPage(page: Page): Promise<void> {
  await ensureMobileEmulation(page);
  await page.goto(COIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: AE_TIMEOUTS.navigation,
  });
}

export async function aliIsLoggedIn(page: Page): Promise<boolean> {
  // Logged-out marker: the coin page swaps its root for `.login-page-container` with a "Log in" button.
  const loginContainer = await page
    .locator(".login-page-container")
    .count()
    .catch(() => 0);
  if (loginContainer > 0) return false;
  // Alternative: if the login flow has already redirected us away, URL will be on login.aliexpress.com.
  if (/login\.aliexpress\.com/.test(page.url())) return false;
  // Positive signal: coin page's primary CTA exists.
  const signBtn = await page
    .locator("#signButton")
    .count()
    .catch(() => 0);
  return signBtn > 0;
}

export const aliexpress: SiteClaimer = {
  name: "aliexpress",
  // Empty homeUrl tells the claimer to skip its pre-navigation — we must navigate to the coin
  // page ourselves AFTER applying mobile emulation, otherwise AliExpress serves the desktop
  // "install the app" wall and none of the coin selectors exist.
  homeUrl: "",

  async isLoggedIn(page: Page): Promise<boolean> {
    // When invoked against a fixture data: URL (tests), trust the current DOM instead of
    // navigating to the real site.
    if (!/^https?:/.test(page.url())) return aliIsLoggedIn(page);
    await gotoCoinPage(page);
    return aliIsLoggedIn(page);
  },

  async claim(page: Page): Promise<ClaimResult> {
    page.setDefaultNavigationTimeout(AE_TIMEOUTS.navigation);
    page.setDefaultTimeout(20_000);

    try {
      await gotoCoinPage(page);

      if (!(await aliIsLoggedIn(page))) {
        throw new LoginRequiredError();
      }

      const signBtn = page.locator("#signButton");
      try {
        await signBtn.waitFor({ state: "visible", timeout: AE_TIMEOUTS.elementVisible });
      } catch {
        logger.warn("aliexpress: #signButton not found on coin page");
        return { status: "error", error: "sign button not found" };
      }

      // The claimable state adds an `aecoin-checkInButton-*` class to the button; once collected
      // for the day, that class is absent (the button becomes an "Earn more coins" shortcut).
      // Using the class keeps the check language-independent.
      const className = (await signBtn.getAttribute("class").catch(() => "")) || "";
      const claimable = /aecoin-checkInButton-/.test(className);
      if (!claimable) {
        logger.info("aliexpress: coins already collected today");
        return { status: "nothing" };
      }

      await signBtn.click({ timeout: AE_TIMEOUTS.elementVisible });
      await page.waitForTimeout(AE_TIMEOUTS.postClick);

      logger.info("aliexpress: daily coins collected");
      return { status: "claimed", items: ["daily coins"] };
    } catch (e) {
      if (e instanceof LoginRequiredError) {
        return { status: "login_required" };
      }
      const msg = e instanceof Error ? e.message : String(e);
      logger.error({ err: msg }, "aliexpress: claim run failed");
      return { status: "error", error: msg };
    }
  },
};
