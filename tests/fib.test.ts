import { describe, expect, test } from "./helpers/expect.ts";
import { fibLevels, findSwing } from "../lib/fib.ts";
import type { Bar } from "../lib/market/twse.ts";

const bar = (date: string, high: number, low: number): Bar => ({ date, open: low, high, low, close: high });

describe("findSwing", () => {
  test("high after low is an up swing", () => {
    const s = findSwing([bar("2026-11-02", 110, 100), bar("2026-11-03", 150, 120), bar("2026-11-04", 140, 130)]);
    expect(s).toEqual({ high: 150, highDate: "2026-11-03", low: 100, lowDate: "2026-11-02", direction: "up" });
  });

  test("only looks at the last N bars", () => {
    const s = findSwing([bar("2026-11-02", 999, 1), bar("2026-11-03", 150, 120), bar("2026-11-04", 140, 100)], 2);
    expect(s?.high).toBe(150);
    expect(s?.direction).toBe("down");
  });

  test("returns null with fewer than two bars", () => {
    expect(findSwing([bar("2026-11-02", 110, 100)])).toBeNull();
  });
});

describe("fibLevels", () => {
  test("down swing levels rise from the low", () => {
    const levels = fibLevels({ high: 2000, highDate: "a", low: 1000, lowDate: "b", direction: "down" });
    expect(levels.map((l) => l.price)).toEqual([1236, 1382, 1500, 1618, 1786]);
  });

  test("up swing levels fall from the high", () => {
    const levels = fibLevels({ high: 2000, highDate: "b", low: 1000, lowDate: "a", direction: "up" });
    expect(levels.map((l) => l.price)).toEqual([1764, 1618, 1500, 1382, 1214]);
  });
});
