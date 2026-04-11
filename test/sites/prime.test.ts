import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { prime } from "../../src/sites/prime.ts";

const fixture = (name: string) =>
  "data:text/html;base64," +
  Buffer.from(readFileSync(join(import.meta.dir, "fixtures", name), "utf8")).toString("base64");

test("prime.isLoggedIn true when user-dropdown-first-name-text is present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("prime-logged-in.html"));
  expect(await prime.isLoggedIn(page)).toBe(true);
  await browser.close();
});

test("prime.isLoggedIn false when sign-in-button is present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("prime-logged-out.html"));
  expect(await prime.isLoggedIn(page)).toBe(false);
  await browser.close();
});

test("prime.isLoggedIn true on detail page with user dropdown", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("prime-detail-unclaimed.html"));
  expect(await prime.isLoggedIn(page)).toBe(true);
  await browser.close();
});
