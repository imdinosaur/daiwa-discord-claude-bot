/**
 * 最小的 vitest `expect` 相容層，讓從 gamma-sentiment 搬來的測試可以直接用 node:test 執行。
 * 只實作那些測試實際用到的 matcher。
 */
import assert from "node:assert/strict";

export { describe, test } from "node:test";

function isSubset(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return Object.is(actual, expected);
  if (actual === null || typeof actual !== "object") return false;
  return Object.entries(expected).every(([k, v]) => isSubset((actual as Record<string, unknown>)[k], v));
}

export function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => assert.ok(Object.is(actual, expected), `expected ${String(actual)} to be ${String(expected)}`),
    toEqual: (expected: unknown) => assert.deepStrictEqual(actual, expected),
    toBeCloseTo: (expected: number, digits = 2) =>
      assert.ok(
        Math.abs((actual as number) - expected) < 10 ** -digits / 2,
        `expected ${String(actual)} to be close to ${expected} (${digits} digits)`,
      ),
    toBeGreaterThan: (n: number) => assert.ok((actual as number) > n, `expected ${String(actual)} > ${n}`),
    toBeLessThan: (n: number) => assert.ok((actual as number) < n, `expected ${String(actual)} < ${n}`),
    toBeNaN: () => assert.ok(Number.isNaN(actual), `expected ${String(actual)} to be NaN`),
    toBeNull: () => assert.equal(actual, null),
    toHaveLength:(n: number) => assert.equal((actual as { length: number }).length, n),
    toMatchObject: (expected: object) =>
      assert.ok(isSubset(actual, expected), `expected ${JSON.stringify(actual)} to match ${JSON.stringify(expected)}`),
    not: {
      toBe: (expected: unknown) => assert.ok(!Object.is(actual, expected), `expected ${String(actual)} not to be ${String(expected)}`),
    },
  };
}
