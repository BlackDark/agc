import { test, expect } from "bun:test";
import { runOnce } from "../src/scheduler.ts";
import type { RunResult } from "../src/notify.ts";

test("runOnce wires claimer → notify and returns results", async () => {
  const sent: RunResult[][] = [];
  const out = await runOnce({
    sites: [
      {
        name: "epic",
        homeUrl: "https://x/",
        isLoggedIn: async () => true,
        claim: async () => ({ status: "claimed", items: ["A"] }),
      },
    ],
    browserProvider: async () =>
      ({
        contexts: () => [
          {
            pages: () => [
              {
                close: async () => {},
                isClosed: () => false,
                bringToFront: async () => {},
                goto: async () => {},
                url: () => "about:blank",
              },
            ],
            newPage: async () => ({
              close: async () => {},
              isClosed: () => false,
              bringToFront: async () => {},
              goto: async () => {},
              url: () => "about:blank",
            }),
            close: async () => {},
          },
        ],
        newContext: async () => ({
          newPage: async () => ({}),
          close: async () => {},
        }),
        close: async () => {},
      }) as any,
    notify: async (r) => {
      sent.push(r);
    },
  });
  expect(out).toHaveLength(1);
  expect(out[0]!.result.status).toBe("claimed");
  expect(sent).toHaveLength(1);
  expect(sent[0]![0]!.result.status).toBe("claimed");
});

test("runOnce reports a top-level error via notify and does not throw", async () => {
  const sent: RunResult[][] = [];
  const out = await runOnce({
    sites: [],
    browserProvider: async () => {
      throw new Error("cdp down");
    },
    notify: async (r) => {
      sent.push(r);
    },
  });
  expect(out).toHaveLength(1);
  expect(out[0]!.name).toBe("_runtime");
  expect(out[0]!.result.status).toBe("error");
  expect(sent).toHaveLength(1);
});
