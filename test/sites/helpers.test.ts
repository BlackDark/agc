import { expect, test } from "bun:test";
import { aggregatePerItemResults } from "../../src/sites/helpers.ts";
import type { PerItemClaimResult } from "../../src/sites/types.ts";

const make = (title: string, outcome: PerItemClaimResult["outcome"], detail?: string): PerItemClaimResult => ({
  title,
  url: `https://example.com/${title}`,
  outcome,
  detail,
});

test("empty list → nothing", () => {
  expect(aggregatePerItemResults([])).toEqual({ status: "nothing" });
});

test("any claimed → status=claimed with titles", () => {
  const result = aggregatePerItemResults([
    make("A", "claimed"),
    make("B", "already_owned"),
    make("C", "failed", "boom"),
  ]);
  expect(result.status).toBe("claimed");
  if (result.status === "claimed") {
    expect(result.items).toEqual(["A"]);
    expect(result.perItem).toHaveLength(3);
  }
});

test("all already_owned → nothing (with perItem)", () => {
  const perItem = [make("A", "already_owned"), make("B", "already_owned")];
  const result = aggregatePerItemResults(perItem);
  expect(result.status).toBe("nothing");
  if (result.status === "nothing") {
    expect(result.perItem).toHaveLength(2);
  }
});

test("only failures → error with joined detail", () => {
  const result = aggregatePerItemResults([make("A", "failed", "boom"), make("B", "failed")]);
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(result.error).toBe("A: boom; B: failed");
    expect(result.perItem).toHaveLength(2);
  }
});

test("mix of already_owned + failed → error", () => {
  const result = aggregatePerItemResults([make("A", "already_owned"), make("B", "failed", "bad")]);
  expect(result.status).toBe("error");
});
