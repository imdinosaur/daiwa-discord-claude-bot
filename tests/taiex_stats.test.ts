import { describe, expect, test } from "./helpers/expect.ts";
import { extremesIn, toWeekly, withBias } from "../lib/market/taiex_stats.ts";
import type { Bar } from "../lib/market/twse.ts";

const bar = (date: string, close: number, low = close): Bar => ({ date, open: close, high: close + 10, low, close });

describe("toWeekly", () => {
  test("groups Monday to Friday into one bar", () => {
    const w = toWeekly([bar("2026-11-13", 100), bar("2026-11-16", 90, 80), bar("2026-11-20", 95)]);
    expect(w).toHaveLength(2);
    expect(w[1]).toEqual({ date: "2026-11-20", start: "2026-11-16", open: 90, high: 105, low: 80, close: 95 });
  });

  test("handles a year boundary inside one ISO week", () => {
    expect(toWeekly([bar("2025-12-31", 1), bar("2026-01-02", 2)])).toHaveLength(1);
  });
});

describe("withBias", () => {
  test("is null until n bars, then close / MA - 1", () => {
    const rows = withBias([bar("a", 10), bar("b", 20), bar("c", 30)], 2);
    expect(rows[0].ma).toBeNull();
    expect(rows[1].ma).toBe(15);
    expect(rows[2].ma).toBe(25);
    expect(rows[2].bias).toBeCloseTo(20, 10);
  });
});

describe("extremesIn", () => {
  test("finds lowest close and deepest bias inside the range", () => {
    const rows = withBias([bar("2025-03-31", 100), bar("2025-04-01", 50), bar("2025-04-02", 60), bar("2025-05-01", 10)], 1);
    const ex = extremesIn(rows, "2025-04-01", "2025-04-30");
    expect(ex?.lowestClose.date).toBe("2025-04-01");
  });

  test("returns null when nothing is in range", () => {
    expect(extremesIn(withBias([bar("2025-03-31", 1)], 1), "2025-04-01", "2025-04-30")).toBeNull();
  });
});
