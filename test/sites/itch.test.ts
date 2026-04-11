import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { itch } from "../../src/sites/itch.ts";

const fixture = (name: string) =>
  "data:text/html;base64," +
  Buffer.from(readFileSync(join(import.meta.dir, "fixtures", name), "utf8")).toString("base64");

test("itch.isLoggedIn true when user menu is present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("itch-logged-in.html"));
  expect(await itch.isLoggedIn(page)).toBe(true);
  await browser.close();
});

test("itch.isLoggedIn false when only a Log in link exists", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("itch-logged-out.html"));
  expect(await itch.isLoggedIn(page)).toBe(false);
  await browser.close();
});
