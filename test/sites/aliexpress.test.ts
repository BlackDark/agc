import { test, expect } from "bun:test";
import { chromium } from "playwright-core";
import { aliexpress } from "../../src/sites/aliexpress.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixture = (name: string) =>
  "data:text/html;base64," +
  Buffer.from(readFileSync(join(import.meta.dir, "fixtures", name), "utf8")).toString("base64");

test("aliexpress.isLoggedIn true when #signButton is present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("aliexpress-logged-in.html"));
  expect(await aliexpress.isLoggedIn(page)).toBe(true);
  await browser.close();
});

test("aliexpress.isLoggedIn false when .login-page-container is present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("aliexpress-logged-out.html"));
  expect(await aliexpress.isLoggedIn(page)).toBe(false);
  await browser.close();
});

test("aliexpress.isLoggedIn true on already-collected page (signButton still present)", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("aliexpress-already-collected.html"));
  expect(await aliexpress.isLoggedIn(page)).toBe(true);
  await browser.close();
});
