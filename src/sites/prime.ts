// src/sites/prime.ts
// Amazon Prime Gaming free games & in-game loot claimer.
//
// Flow (based on actual page snapshots, language-independent selectors):
//   1. Navigate to https://gaming.amazon.com/home
//   2. Find all unclaimed FGWP (Free Games With Prime) offer cards:
//      - Cards with `[data-a-target="FGWPOffer"]` = claimable (link to detail page)
//      - Cards with `[data-a-target="notification-success"]` = already claimed (skip)
//      - Cards with `[data-a-target="LunaOffer"]` = Luna streaming (not claim-to-own, skip)
//   3. For each unclaimed card:
//      - Read the title from the card's `<h3>` element
//      - Navigate to the detail page (FGWPOffer is an <a> with href)
//      - On detail page, click `[data-a-target="buy-box_call-to-action"]`
//      - Navigate back and continue with next card
//
// GOG key redemption: if the detail page reveals a GOG.com key after claiming,
// we auto-redeem it on gog.com in a separate tab.
import type { Page } from "playwright-core";
import { logger } from "../logger.ts";
import { redeemGogCode } from "./gog-redeem.ts";
import { aggregatePerItemResults, dismissCookieBanner, LoginRequiredError } from "./helpers.ts";
import type { ClaimResult, PerItemClaimResult, SiteClaimer } from "./types.ts";

const PRIME_TIMEOUTS = {
  navigation: 90_000,
  elementVisible: 30_000,
  postClick: 45_000,
} as const;

// --- Login detection ---

async function primeIsLoggedIn(page: Page): Promise<boolean> {
  const userDropdown = await page.locator('[data-a-target="user-dropdown-first-name-text"]').count();
  if (userDropdown > 0) return true;
  const signIn = await page.locator('[data-a-target="sign-in-button"]').count();
  return signIn === 0;
}

// --- Card collection ---

type OfferCard = {
  title: string;
  href: string;
};

/**
 * Collect all unclaimed FGWP offers from the main listing page.
 * Each `[data-a-target="FGWPOffer"]` is an `<a>` with an `href` to the detail page
 * and an `aria-label` containing the game title.
 */
async function collectUnclaimedOffers(page: Page): Promise<OfferCard[]> {
  // Scroll to trigger lazy-loaded card sections.
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 1500).catch(() => {});
    await page.waitForTimeout(400);
  }

  const links = page.locator('[data-a-target="FGWPOffer"]');
  const count = await links.count();
  const offers: OfferCard[] = [];

  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href").catch(() => null);
    if (!href) continue;

    // Title from closest <h3> in the card, or from aria-label on the link itself.
    let title = "unknown";
    const card = link.locator("xpath=ancestor::div[contains(@class,'item-card-details')]");
    const h3 = card.locator("h3").first();
    if (await h3.count().catch(() => 0)) {
      title = ((await h3.getAttribute("title").catch(() => null)) || (await h3.innerText().catch(() => ""))).trim();
    }
    if (title === "unknown") {
      title = (await link.getAttribute("aria-label").catch(() => "")) || "unknown";
    }

    // Resolve relative href.
    const fullUrl = href.startsWith("http") ? href : `https://gaming.amazon.com${href}`;
    offers.push({ title, href: fullUrl });
  }

  return offers;
}

// --- GOG key extraction + redemption ---

async function extractPrimeCode(page: Page): Promise<string | null> {
  const input = page.locator('input[data-a-target="copy-action"], [data-a-target="copy-action-button"] + input').first();
  if (await input.count()) {
    const v = await input.inputValue().catch(() => "");
    if (v && /[A-Z0-9]{4,}(-[A-Z0-9]{4,}){2,}/.test(v)) return v.trim();
  }
  const body = await page.locator("body").innerText().catch(() => "");
  const m = body.match(/\b[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\b/);
  return m?.[0] ?? null;
}

async function isGogKeyOffer(page: Page): Promise<boolean> {
  const text = await page.locator("body").innerText().catch(() => "");
  return /gog\.com/i.test(text);
}

async function handleGogRedemption(page: Page, base: { title: string; url: string }): Promise<PerItemClaimResult | null> {
  if (!(await isGogKeyOffer(page))) return null;

  const code = await extractPrimeCode(page);
  if (!code) {
    logger.warn({ title: base.title }, "prime: GOG offer but no code extracted from detail page");
    return null;
  }

  logger.info({ title: base.title }, "prime: detected GOG key — attempting auto-redeem");
  const ctx = page.context();
  const outcome = await redeemGogCode(ctx, code);
  switch (outcome.status) {
    case "redeemed":
      return { ...base, outcome: "claimed", detail: "redeemed on gog.com" };
    case "already_used":
      return { ...base, outcome: "already_owned", detail: "GOG code already used" };
    case "code_not_found":
      return { ...base, outcome: "failed", detail: "GOG: code not found" };
    case "captcha":
      return { ...base, outcome: "failed", detail: "GOG redeem: captcha — solve in Kasm UI" };
    case "login_required":
      return { ...base, outcome: "failed", detail: "GOG: login required — sign in via Kasm UI" };
    case "error":
      return { ...base, outcome: "failed", detail: `GOG redeem: ${outcome.error}` };
  }
}

// --- Per-offer claim on the detail page ---

async function claimOneOffer(page: Page, offer: OfferCard): Promise<PerItemClaimResult> {
  const base = { title: offer.title, url: offer.href };

  try {
    // Navigate to the detail page (FGWPOffer href).
    await page.goto(offer.href, {
      waitUntil: "domcontentloaded",
      timeout: PRIME_TIMEOUTS.navigation,
    });
    await dismissCookieBanner(page);

    // Verify we're still logged in on the detail page.
    if (!(await primeIsLoggedIn(page))) {
      throw new LoginRequiredError();
    }

    // Wait for buy-box CTA to appear and click it.
    const cta = page.locator('[data-a-target="buy-box_call-to-action"]');
    try {
      await cta.waitFor({ state: "visible", timeout: PRIME_TIMEOUTS.elementVisible });
    } catch {
      // No buy-box CTA — might already be claimed, or a different page layout.
      const success = page.locator('[data-a-target="notification-success"]');
      if (await success.count().catch(() => 0)) {
        logger.info({ title: offer.title }, "prime: already claimed (detail page)");
        return { ...base, outcome: "already_owned" };
      }
      logger.warn({ title: offer.title }, "prime: buy-box CTA not found on detail page");
      return { ...base, outcome: "failed", detail: "buy-box CTA not found" };
    }

    await cta.click({ timeout: PRIME_TIMEOUTS.postClick });
    await page.waitForTimeout(2_000);

    // After clicking, check for GOG key redemption opportunity.
    const gogResult = await handleGogRedemption(page, base);
    if (gogResult) return gogResult;

    logger.info({ title: offer.title, url: offer.href }, "prime: claim click completed");
    return { ...base, outcome: "claimed" };
  } catch (e) {
    if (e instanceof LoginRequiredError) throw e;
    const detail = e instanceof Error ? e.message : String(e);
    logger.warn({ title: offer.title, err: detail }, "prime: claim failed");
    return { ...base, outcome: "failed", detail };
  }
}

// --- Site claimer ---

export const prime: SiteClaimer = {
  name: "prime",
  homeUrl: "https://gaming.amazon.com/home",

  async isLoggedIn(page: Page): Promise<boolean> {
    return primeIsLoggedIn(page);
  },

  async claim(page: Page): Promise<ClaimResult> {
    page.setDefaultNavigationTimeout(PRIME_TIMEOUTS.navigation);
    page.setDefaultTimeout(20_000);

    try {
      await page.goto("https://gaming.amazon.com/home", {
        waitUntil: "domcontentloaded",
        timeout: PRIME_TIMEOUTS.navigation,
      });
      await dismissCookieBanner(page);

      if (!(await primeIsLoggedIn(page))) {
        throw new LoginRequiredError();
      }

      const offers = await collectUnclaimedOffers(page);
      if (offers.length === 0) {
        logger.info("prime: no unclaimed FGWP offers");
        return { status: "nothing" };
      }

      logger.info({ count: offers.length }, "prime: found unclaimed FGWP offers");

      const perItem: PerItemClaimResult[] = [];
      for (const offer of offers) {
        const result = await claimOneOffer(page, offer);
        perItem.push(result);
      }

      return aggregatePerItemResults(perItem);
    } catch (e) {
      if (e instanceof LoginRequiredError) {
        return { status: "login_required" };
      }
      const msg = e instanceof Error ? e.message : String(e);
      logger.error({ err: msg }, "prime: claim run failed");
      return { status: "error", error: msg };
    }
  },
};
