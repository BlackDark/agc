// test/sites/epic.test.ts
import { test, expect } from "bun:test";
import { chromium } from "playwright-core";
import { epic } from "../../src/sites/epic.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixture = (name: string) =>
  "data:text/html;base64," +
  Buffer.from(readFileSync(join(import.meta.dir, "fixtures", name), "utf8")).toString("base64");

test("epic.isLoggedIn true with avatar present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("epic-logged-in.html"));
  expect(await epic.isLoggedIn(page)).toBe(true);
  await browser.close();
});

test("epic.isLoggedIn false with Sign In link present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("epic-logged-out.html"));
  expect(await epic.isLoggedIn(page)).toBe(false);
  await browser.close();
});

test("epic.isLoggedIn true with Account menu (live store pattern)", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("epic-logged-in-account-menu.html"));
  expect(await epic.isLoggedIn(page)).toBe(true);
  await browser.close();
});
