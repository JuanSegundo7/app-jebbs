import { describe, expect, it } from "vitest";
import { isOptimisticAddress, isUuid } from "./is-uuid";

describe("isUuid", () => {
  it("accepts a canonical uuid (any case)", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("rejects optimistic ids and garbage", () => {
    expect(isUuid("optimistic-123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("isOptimisticAddress", () => {
  it("detects the flag or the id prefix", () => {
    expect(isOptimisticAddress({ id: "abc", _optimistic: true })).toBe(true);
    expect(isOptimisticAddress({ id: "optimistic-abc" })).toBe(true);
    expect(isOptimisticAddress({ id: "123e4567-e89b-12d3-a456-426614174000" })).toBe(false);
    expect(isOptimisticAddress(null)).toBe(false);
  });
});
