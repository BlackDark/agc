import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ubisoft } from "../../src/sites/ubisoft.ts";

const fixture = (name: string) =>
  "data:text/html;base64," +
  Buffer.from(readFileSync(join(import.meta.dir, "fixtures", name), "utf8")).toString("base64");

test("ubisoft.isLoggedIn true when account button is present", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("ubisoft-logged-in.html"));
  expect(await ubisoft.isLoggedIn(page)).toBe(true);
  await browser.close();
});

test("ubisoft.isLoggedIn false when only Sign in link exists", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(fixture("ubisoft-logged-out.html"));
  expect(await ubisoft.isLoggedIn(page)).toBe(false);
  await browser.close();
});
