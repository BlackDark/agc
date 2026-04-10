import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { xbox } from "../../src/sites/xbox.ts";

const fixture = (name: string) =>
  "data:text/html;base64," +
  Buffer.from(readFileSync(join(import.meta.dir, "fixtures", name), "utf8")).toString("base64");

test("xbox.isLoggedIn true when me-control trigger is present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("xbox-logged-in.html"));
  expect(await xbox.isLoggedIn(page)).toBe(true);
  await browser.close();
});

test("xbox.isLoggedIn false when only Sign in link exists", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("xbox-logged-out.html"));
  expect(await xbox.isLoggedIn(page)).toBe(false);
  await browser.close();
});
