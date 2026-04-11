// test/sites/gog.test.ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { gog } from "../../src/sites/gog.ts";

const fixture = (name: string) =>
  "data:text/html;base64," +
  Buffer.from(readFileSync(join(import.meta.dir, "fixtures", name), "utf8")).toString("base64");

test("gog.isLoggedIn true with no Sign in link", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("gog-logged-in.html"));
  expect(await gog.isLoggedIn(page)).toBe(true);
  await browser.close();
});

test("gog.isLoggedIn false with Sign in link present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("gog-logged-out.html"));
  expect(await gog.isLoggedIn(page)).toBe(false);
  await browser.close();
});
