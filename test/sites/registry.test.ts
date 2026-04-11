import { expect, test } from "bun:test";
import type { Config } from "../../src/config.ts";
import { enabledSites } from "../../src/sites/registry.ts";

function cfg(overrides: Partial<Config["sites"]>): Config {
  return {
    runMode: "once",
    cronSchedule: undefined,
    tz: "UTC",
    logLevel: "info",
    sites: {
      epic: false,
      prime: false,
      gog: false,
      itch: false,
      ubisoft: false,
      xbox: false,
      aliexpress: false,
      ...overrides,
    },
    appriseUrls: [],
    notifyOn: new Set(),
  };
}

test("enabledSites returns empty when all flags off", () => {
  expect(enabledSites(cfg({}))).toEqual([]);
});

test("enabledSites returns only the enabled sites, in canonical order", () => {
  const sites = enabledSites(cfg({ epic: true, gog: true, xbox: true }));
  expect(sites.map((s) => s.name)).toEqual(["epic", "gog", "xbox"]);
});

test("all site flags on → full set", () => {
  const sites = enabledSites(
    cfg({ epic: true, prime: true, gog: true, itch: true, ubisoft: true, xbox: true, aliexpress: true }),
  );
  expect(sites.map((s) => s.name)).toEqual(["epic", "prime", "gog", "itch", "ubisoft", "xbox", "aliexpress"]);
});
