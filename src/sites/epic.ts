// src/sites/epic.ts
// Purchase UI: [data-testid="purchase-cta-button"] → checkout iframe under .webPurchaseContainer iframe
// (Place Order / I Agree). Logged-in: [data-testid="user-avatar-button"] or button "Account menu"; logged out: Sign in link.
// Epic may show captcha — automation cannot solve it; user must complete in the Kasm UI.
import type { Page } from "playwright-core";
import { logger } from "../logger.ts";
import { fetchWeeklyFreeOffers } from "./epic-api.ts";
import {
  aggregatePerItemResults,
  clickOptional,
  dismissCookieBanner,
  LoginRequiredError,
} from "./helpers.ts";
import type { ClaimResult, PerItemClaimResult, SiteClaimer } from "./types.ts";

/** Navigation and Playwright action timeouts (ms). */
export const EPIC_TIMEOUTS = {
  navigation: 90_000,
  ctaVisible: 45_000,
  postClick: 60_000,
  iframeAction: 90_000,
  loginPoll: 15_000,
  checkoutSuccess: 90_000,
} as const;

async function isLoggedInOnPage(page: Page): Promise<boolean> {
  const avatar = page.locator('[data-testid="user-avatar-button"]');
  const accountMenu = page.getByRole("button", { name: /^account menu$/i });
  const signIn = page.getByRole("link", { name: /^sign in$/i });
  try {
    await Promise.race([
      avatar.first().waitFor({ state: "visible", timeout: EPIC_TIMEOUTS.loginPoll }),
      accountMenu.first().waitFor({ state: "visible", timeout: EPIC_TIMEOUTS.loginPoll }),
      signIn.first().waitFor({ state: "visible", timeout: EPIC_TIMEOUTS.loginPoll }),
    ]);
  } catch {
    /* none visible in time — fall through to counts */
  }
  if ((await avatar.count()) > 0) return true;
  if ((await accountMenu.count()) > 0) return true;
  if ((await signIn.count()) > 0) return false;
  return false;
}

function purchaseCta(page: Page) {
  return page.getByTestId("purchase-cta-button").first();
}

async function ctaLabel(page: Page): Promise<string> {
  const cta = purchaseCta(page);
  await cta.waitFor({ state: "visible", timeout: EPIC_TIMEOUTS.ctaVisible });
  return (await cta.innerText()).trim();
}

/** Epic often shows "Device not supported" / platform warning — always continue to complete the free purchase. */
async function continueThroughUnsupportedOrPlatformSteps(page: Page): Promise<void> {
  const platformStepBtn = page.locator(`div[data-component="makePlatformUnsupportedWarningStep"] button`).first();
  const unsupportedHeading = page.getByRole("heading", {
    name: /device not supported|platform not supported|unsupported platform/i,
  });
  for (let i = 0; i < 10; i++) {
    let advanced = false;
    if (await platformStepBtn.isVisible().catch(() => false)) {
      await platformStepBtn.click({ timeout: EPIC_TIMEOUTS.postClick });
      advanced = true;
    } else if (await unsupportedHeading.first().isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /^continue$/i }).first().click({ timeout: EPIC_TIMEOUTS.postClick });
      advanced = true;
    }
    if (!advanced) break;
  }
}

async function completeCheckoutInIframe(page: Page): Promise<void> {
  await page
    .locator(".webPurchaseContainer iframe")
    .first()
    .waitFor({ state: "attached", timeout: EPIC_TIMEOUTS.postClick });

  const iframe = page.frameLocator(".webPurchaseContainer iframe").first();
  const placeOrder = iframe.getByRole("button", { name: /place order/i });
  const iAgree = iframe.getByRole("button", { name: /^i agree$/i });
  const continueBtn = iframe.getByRole("button", { name: /^continue$/i });

  for (let round = 0; round < 5; round++) {
    await continueBtn.waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
    await clickOptional(continueBtn, 12_000);

    await iAgree.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    await clickOptional(iAgree, EPIC_TIMEOUTS.iframeAction);

    const poVisible = await placeOrder.isVisible().catch(() => false);
    if (poVisible) {
      try {
        await placeOrder.click({ timeout: EPIC_TIMEOUTS.iframeAction });
      } catch {
        await clickOptional(iAgree, EPIC_TIMEOUTS.iframeAction);
        await placeOrder.click({ timeout: EPIC_TIMEOUTS.iframeAction });
      }
    }

    const containerHidden = await page
      .locator(".webPurchaseContainer")
      .first()
      .isHidden()
      .catch(() => true);
    if (containerHidden) break;
  }

  await page.locator(".webPurchaseContainer").first().waitFor({ state: "hidden", timeout: EPIC_TIMEOUTS.checkoutSuccess });
}

/** Reload product page and require CTA to read "In Library" (order completed). */
async function verifyPurchaseSucceeded(page: Page): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded", timeout: EPIC_TIMEOUTS.navigation });
  await dismissCookieBanner(page);
  await purchaseCta(page).waitFor({ state: "visible", timeout: EPIC_TIMEOUTS.ctaVisible });
  const label = await ctaLabel(page);
  if (!/in library|see in library/i.test(label)) {
    throw new Error(`checkout did not complete: CTA is "${label}" (expected In Library)`);
  }
}

async function claimOneOffer(page: Page, o: { title: string; storeUrl: string }): Promise<PerItemClaimResult> {
  const base = { title: o.title, url: o.storeUrl };

  try {
    await page.goto(o.storeUrl, {
      waitUntil: "domcontentloaded",
      timeout: EPIC_TIMEOUTS.navigation,
    });
    await dismissCookieBanner(page);

    if (!(await isLoggedInOnPage(page))) {
      logger.warn({ title: o.title, url: o.storeUrl }, "epic: not signed in on product page");
      throw new LoginRequiredError();
    }

    let label: string;
    try {
      label = await ctaLabel(page);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      logger.warn({ title: o.title, err: detail }, "epic: purchase CTA not found");
      return { ...base, outcome: "failed" as const, detail: `no purchase button: ${detail}` };
    }

    if (/in library|see in library|^owned$/i.test(label)) {
      logger.info({ title: o.title, url: o.storeUrl }, "epic: already in library");
      return { title: o.title, url: o.storeUrl, outcome: "already_owned" };
    }

    const cta = purchaseCta(page);
    await cta.click({ timeout: EPIC_TIMEOUTS.postClick });

    await continueThroughUnsupportedOrPlatformSteps(page);

    await page
      .getByRole("button", { name: /^continue$/i })
      .first()
      .click({ timeout: 20_000 })
      .catch(() => {});

    await completeCheckoutInIframe(page);
    await verifyPurchaseSucceeded(page);

    logger.info({ title: o.title, url: o.storeUrl }, "epic: claimed — order finished (In Library)");
    return { title: o.title, url: o.storeUrl, outcome: "claimed" };
  } catch (e) {
    if (e instanceof LoginRequiredError) throw e;
    const detail = e instanceof Error ? e.message : String(e);
    logger.warn({ title: o.title, err: detail }, "epic: claim failed");
    return { ...base, outcome: "failed" as const, detail };
  }
}

export const epic: SiteClaimer = {
  name: "epic",
  homeUrl: "https://store.epicgames.com/en-US/",

  async isLoggedIn(page: Page): Promise<boolean> {
    return isLoggedInOnPage(page);
  },

  async claim(page: Page): Promise<ClaimResult> {
    page.setDefaultNavigationTimeout(EPIC_TIMEOUTS.navigation);
    page.setDefaultTimeout(25_000);

    let offers: Awaited<ReturnType<typeof fetchWeeklyFreeOffers>>;
    try {
      offers = await fetchWeeklyFreeOffers();
    } catch (e) {
      logger.error({ err: String(e) }, "epic: failed to fetch free games list");
      return { status: "error", error: `free games API: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (offers.length === 0) {
      logger.info("epic: no active weekly free promotions");
      return { status: "nothing" };
    }

    const perItem: PerItemClaimResult[] = [];

    for (const o of offers) {
      logger.info(
        { title: o.title, namespace: o.namespace, offerId: o.offerId, storeUrl: o.storeUrl },
        "epic: claiming offer",
      );
      try {
        const result = await claimOneOffer(page, o);
        perItem.push(result);
        logger.info(
          { title: o.title, outcome: result.outcome, url: o.storeUrl, detail: result.detail },
          "epic: offer result",
        );
      } catch (e) {
        if (e instanceof LoginRequiredError) {
          logger.warn("epic: login required during claim run");
          return { status: "login_required", perItem };
        }
        throw e;
      }
    }

    return aggregatePerItemResults(perItem);
  },
};
