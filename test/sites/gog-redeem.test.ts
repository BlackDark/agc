import { expect, test } from "bun:test";
import { classifyRedeemResponseBody } from "../../src/sites/gog-redeem.ts";

test("captcha detected via reason", () => {
  expect(classifyRedeemResponseBody(JSON.stringify({ reason: "Invalid or no captcha" }))).toBe("captcha");
});

test("captcha detected via reason2", () => {
  expect(classifyRedeemResponseBody(JSON.stringify({ reason2: "captcha_required" }))).toBe("captcha");
});

test("code_used exact match", () => {
  expect(classifyRedeemResponseBody(JSON.stringify({ reason: "code_used" }))).toBe("code_used");
});

test("code_not_found exact match", () => {
  expect(classifyRedeemResponseBody(JSON.stringify({ reason: "code_not_found" }))).toBe("code_not_found");
});

test("unknown reason → null", () => {
  expect(classifyRedeemResponseBody(JSON.stringify({ reason: "something_else" }))).toBeNull();
});

test("empty object → null", () => {
  expect(classifyRedeemResponseBody("{}")).toBeNull();
});

test("invalid JSON → null", () => {
  expect(classifyRedeemResponseBody("<html>not json</html>")).toBeNull();
});

test("product payload (success case) → null", () => {
  const body = JSON.stringify({ products: [{ id: "1408290682", title: "Cool Game" }] });
  expect(classifyRedeemResponseBody(body)).toBeNull();
});
