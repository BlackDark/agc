import { expect, test } from "bun:test";
import { buildBody, shouldNotify } from "../src/notify.ts";
import type { ClaimResult } from "../src/sites/types.ts";

test("shouldNotify true when any result matches filter", () => {
  const filter = new Set(["claimed", "error", "login_required"] as const);
  const results: Array<{ name: string; result: ClaimResult }> = [
    { name: "epic", result: { status: "nothing" } },
    { name: "gog", result: { status: "claimed", items: ["Foo"] } },
  ];
  expect(shouldNotify(results, filter)).toBe(true);
});

test("shouldNotify false when nothing matches filter", () => {
  const filter = new Set(["claimed"] as const);
  const results: Array<{ name: string; result: ClaimResult }> = [{ name: "epic", result: { status: "nothing" } }];
  expect(shouldNotify(results, filter)).toBe(false);
});

test("buildBody includes all sites with their statuses", () => {
  const body = buildBody([
    { name: "epic", result: { status: "claimed", items: ["Game A", "Game B"] } },
    { name: "gog", result: { status: "nothing" } },
    { name: "prime", result: { status: "error", error: "boom" } },
  ]);
  expect(body).toContain("epic");
  expect(body).toContain("Game A");
  expect(body).toContain("Game B");
  expect(body).toContain("gog");
  expect(body).toContain("prime");
  expect(body).toContain("boom");
});

test("buildBody includes per-item lines with URLs for epic", () => {
  const body = buildBody([
    {
      name: "epic",
      result: {
        status: "claimed",
        items: ["X"],
        perItem: [
          { title: "X", url: "https://store.epicgames.com/en-US/p/x", outcome: "claimed" },
          {
            title: "Y",
            url: "https://store.epicgames.com/en-US/p/y",
            outcome: "already_owned",
          },
        ],
      },
    },
  ]);
  expect(body).toContain("https://store.epicgames.com/en-US/p/x");
  expect(body).toContain("already owned");
});
