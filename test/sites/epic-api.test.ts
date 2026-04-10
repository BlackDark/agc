// test/sites/epic-api.test.ts
import { test, expect } from "bun:test";
import { parseFreeGamesPromotionsPayload } from "../../src/sites/epic-api.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sample = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures", "epic-promotions-sample.json"), "utf8"),
);

test("parseFreeGamesPromotionsPayload extracts $0 offers in active window", () => {
  const now = new Date("2025-06-01T12:00:00.000Z");
  const offers = parseFreeGamesPromotionsPayload(sample, {
    now,
    localePrefix: "https://store.epicgames.com/en-US",
  });
  expect(offers).toHaveLength(1);
  expect(offers[0]!.title).toBe("Sample Free Game");
  expect(offers[0]!.offerId).toBe("offer-id-1");
  expect(offers[0]!.namespace).toBe("ns-1");
  expect(offers[0]!.storeUrl).toBe("https://store.epicgames.com/en-US/p/sample-game-abc");
});
