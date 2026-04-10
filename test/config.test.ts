// test/config.test.ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, ConfigError } from "../src/config.ts";

const ORIG = { ...process.env };
beforeEach(() => { for (const k of Object.keys(process.env)) delete process.env[k]; });
afterEach(() => { for (const k of Object.keys(process.env)) delete process.env[k]; Object.assign(process.env, ORIG); });

test("defaults: schedule mode requires CRON_SCHEDULE", () => {
  expect(() => loadConfig()).toThrow(ConfigError);
});

test("valid schedule config", () => {
  process.env.CRON_SCHEDULE = "0 12 * * *";
  const c = loadConfig();
  expect(c.runMode).toBe("schedule");
  expect(c.cronSchedule).toBe("0 12 * * *");
  expect(c.sites.epic).toBe(true);
  expect(c.sites.prime).toBe(true);
  expect(c.sites.gog).toBe(true);
  expect(c.notifyOn).toEqual(new Set(["claimed", "error", "login_required"]));
  expect(c.appriseUrls).toEqual([]);
});

test("once mode does not need CRON_SCHEDULE", () => {
  process.env.RUN_MODE = "once";
  const c = loadConfig();
  expect(c.runMode).toBe("once");
});

test("APPRISE_URLS parsed and trimmed", () => {
  process.env.RUN_MODE = "once";
  process.env.APPRISE_URLS = "discord://x , ntfy://y";
  expect(loadConfig().appriseUrls).toEqual(["discord://x", "ntfy://y"]);
});

test("invalid NOTIFY_ON value rejected", () => {
  process.env.RUN_MODE = "once";
  process.env.NOTIFY_ON = "claimed,bogus";
  expect(() => loadConfig()).toThrow(ConfigError);
});

test("CLAIM_* false disables a site", () => {
  process.env.RUN_MODE = "once";
  process.env.CLAIM_EPIC = "false";
  expect(loadConfig().sites.epic).toBe(false);
});

test("new sites default to off", () => {
  process.env.RUN_MODE = "once";
  const c = loadConfig();
  expect(c.sites.itch).toBe(false);
  expect(c.sites.ubisoft).toBe(false);
  expect(c.sites.xbox).toBe(false);
});

test("CLAIM_ITCH=true enables itch", () => {
  process.env.RUN_MODE = "once";
  process.env.CLAIM_ITCH = "true";
  expect(loadConfig().sites.itch).toBe(true);
});
