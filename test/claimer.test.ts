// test/claimer.test.ts
import { expect, test } from "bun:test";
import { runClaim } from "../src/claimer.ts";
import type { ClaimResult, SiteClaimer } from "../src/sites/types.ts";

const fakePage = {
  close: async () => {},
  isClosed: () => false,
  bringToFront: async () => {},
  goto: async () => {},
  url: () => "about:blank",
} as any;
const fakeContext = {
  pages: () => [fakePage],
  newPage: async () => fakePage,
  close: async () => {},
} as any;
const fakeBrowser = {
  contexts: () => [fakeContext],
  newContext: async () => fakeContext,
  close: async () => {},
} as any;

const site = (name: string, result: ClaimResult, loggedIn = true): SiteClaimer => ({
  name: name as any,
  homeUrl: "https://example.com/",
  isLoggedIn: async () => loggedIn,
  claim: async () => result,
});

test("runs each site, aggregates results", async () => {
  const sites = [site("epic", { status: "claimed", items: ["A"] }), site("gog", { status: "nothing" })];
  const out = await runClaim(sites, async () => fakeBrowser);
  expect(out.map((r) => r.name)).toEqual(["epic", "gog"]);
  expect(out[0]!.result.status).toBe("claimed");
  expect(out[1]!.result.status).toBe("nothing");
});

test("login_required when isLoggedIn is false (claim is not called)", async () => {
  let claimCalled = false;
  const sites: SiteClaimer[] = [
    {
      name: "epic",
      homeUrl: "https://example.com/",
      isLoggedIn: async () => false,
      claim: async () => {
        claimCalled = true;
        return { status: "nothing" };
      },
    },
  ];
  const out = await runClaim(sites, async () => fakeBrowser);
  expect(out[0]!.result.status).toBe("login_required");
  expect(claimCalled).toBe(false);
});

test("a thrown site error is isolated and reported", async () => {
  const sites: SiteClaimer[] = [
    {
      name: "epic",
      homeUrl: "https://example.com/",
      isLoggedIn: async () => true,
      claim: async () => {
        throw new Error("boom");
      },
    },
    site("gog", { status: "nothing" }),
  ];
  const out = await runClaim(sites, async () => fakeBrowser);
  expect(out[0]!.result.status).toBe("error");
  if (out[0]!.result.status === "error") expect(out[0]!.result.error).toContain("boom");
  expect(out[1]!.result.status).toBe("nothing");
});
