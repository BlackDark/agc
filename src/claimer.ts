// src/claimer.ts
// Orchestrates one claim pass across all enabled sites.
//
// Session strategy: we connect to Chromium over CDP and DRIVE THE EXISTING TAB the user sees in
// the Kasm/VNC view. `browser.newContext()` would create an isolated profile the user never sees,
// which defeats manual login — so we reuse `contexts()[0].pages()[0]` whenever possible.
import type { Browser, BrowserContext, Page } from "playwright-core";
import { chromium } from "playwright-core";
import { logger } from "./logger.ts";
import type { RunResult } from "./notify.ts";
import type { SiteClaimer } from "./sites/types.ts";

const DEFAULT_CDP_CONNECT_TIMEOUT_MS = 120_000;

export type BrowserProvider = () => Promise<Browser>;

export const cdpProvider =
  (cdpUrl: string): BrowserProvider =>
  () => {
    const raw = process.env.CDP_CONNECT_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : DEFAULT_CDP_CONNECT_TIMEOUT_MS;
    const timeout = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CDP_CONNECT_TIMEOUT_MS;
    return chromium.connectOverCDP(cdpUrl, { timeout, isLocal: true });
  };

/** Prefer the existing window/session (VNC-visible). `newContext()` is a separate profile — often invisible. */
async function sharedOrNewContext(browser: Browser): Promise<{ ctx: BrowserContext; closeWhenDone: boolean }> {
  const existing = browser.contexts();
  if (existing.length > 0) {
    logger.debug({ contexts: existing.length }, "cdp: reusing existing browser context (visible session)");
    return { ctx: existing[0]!, closeWhenDone: false };
  }
  logger.debug("cdp: no existing context, creating one");
  return { ctx: await browser.newContext(), closeWhenDone: true };
}

/** DevTools tabs (chrome://devtools, devtools://...) can't be driven — filter them out. */
function isAutomatableTab(p: Page): boolean {
  const u = p.url();
  return !u.startsWith("devtools://") && !u.startsWith("chrome://devtools");
}

/**
 * Playwright CDP docs: use `contexts()[0].pages()[0]` — `newPage()` often opens a background tab
 * the VNC user never sees. Prefer the tab Chromium already opened on startup; skip DevTools.
 */
async function pickOrCreatePage(ctx: BrowserContext): Promise<{ page: Page; pageOwned: boolean }> {
  const open = ctx.pages().filter((p) => !p.isClosed());
  const mainTabs = open.filter(isAutomatableTab);
  const candidates = mainTabs.length > 0 ? mainTabs : open;
  if (candidates.length > 0) {
    const page = candidates[0]!;
    logger.info({ url: page.url() }, "cdp: driving existing tab (visible session)");
    return { page, pageOwned: false };
  }
  logger.info("cdp: no open tab yet — opening one");
  return { page: await ctx.newPage(), pageOwned: true };
}

/** Run one site's isLoggedIn → claim pipeline. Errors are captured as `status: error`. */
async function runOneSite(site: SiteClaimer, page: Page): Promise<RunResult> {
  try {
    if (site.homeUrl) {
      try {
        await page.goto(site.homeUrl, { waitUntil: "domcontentloaded" });
      } catch (e) {
        logger.warn({ site: site.name, err: String(e) }, "navigation failed");
      }
    }
    if (!(await site.isLoggedIn(page))) {
      return { name: site.name, result: { status: "login_required" } };
    }
    const result = await site.claim(page);
    return { name: site.name, result };
  } catch (err) {
    return {
      name: site.name,
      result: { status: "error", error: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function runClaim(sites: SiteClaimer[], provider: BrowserProvider): Promise<RunResult[]> {
  const browser = await provider();
  try {
    const { ctx, closeWhenDone: closeCtx } = await sharedOrNewContext(browser);
    try {
      const { page, pageOwned } = await pickOrCreatePage(ctx);
      try {
        await page.bringToFront().catch(() => {});
        const results: RunResult[] = [];
        for (const site of sites) {
          results.push(await runOneSite(site, page));
        }
        return results;
      } finally {
        if (pageOwned) await page.close().catch(() => {});
      }
    } finally {
      if (closeCtx) await ctx.close().catch(() => {});
    }
  } finally {
    // We connected over CDP — `browser.close()` just disconnects; it does NOT kill the user's Chromium.
    await browser.close().catch(() => {});
  }
}
