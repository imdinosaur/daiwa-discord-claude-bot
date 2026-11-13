import { describe, expect, test } from "./helpers/expect.ts";
import { boxAround, buildZones, findCrossings, findWalls, toSpot } from "../lib/gamma/levels.ts";
import type { CurvePoint, DayResult, KeyLevels } from "../lib/gamma/types.ts";
import type { Bar } from "../lib/market/twse.ts";

describe("findCrossings", () => {
  test("finds every sign change with interpolated level and direction", () => {
    const xs = [0, 10, 20, 30, 40];
    const ys = [-2, 2, 4, -4, -1];
    expect(findCrossings(xs, ys)).toEqual([
      { level: 5, dir: "up" },
      { level: 25, dir: "down" },
    ]);
  });

  test("returns nothing when the curve never changes sign", () => {
    expect(findCrossings([0, 1, 2], [1, 2, 3])).toEqual([]);
  });
});

describe("buildZones", () => {
  const curve = (now: number[], after: number[]): CurvePoint[] =>
    now.map((n, i) => ({ level: i * 100, now: n, after: after[i] }));

  test("pairs each post-settlement flip with the nearest same-direction pre-settlement flip", () => {
    // after 在 150 由負轉正；now 在 250 由負轉正 → 區間 150~250
    const c = curve([-3, -2, -1, 1, 2], [-1, -1, 1, 1, 1]);
    expect(buildZones(c, 400)).toEqual([{ low: 150, high: 250, dir: "up" }]);
  });

  test("leaves a zero-width zone when the partner is too far", () => {
    const c = curve([-3, -2, -1, 1, 2], [-1, -1, 1, 1, 1]);
    expect(buildZones(c, 100)).toEqual([{ low: 150, high: 150, dir: "up" }]);
  });
});

describe("walls and box", () => {
  const strikes = [
    { K: 900, call: 1, put: -5 },
    { K: 950, call: 2, put: -9 },
    { K: 1050, call: 8, put: -1 },
    { K: 1100, call: 6, put: 0 },
  ];

  test("callWall is the biggest call GEX above F0, putWall the biggest put GEX below", () => {
    expect(findWalls(strikes, 1000)).toEqual({ callWall: 1050, putWall: 950 });
  });

  test("boxAround picks the nearest level on each side", () => {
    const lv: KeyLevels = { zones: [{ low: 980, high: 1010, dir: "up" }], callWall: 1050, putWall: 950 };
    expect(boxAround(lv, 1000)).toEqual({ upper: 1010, lower: 980, upperKind: "flip", lowerKind: "flip" });
    expect(boxAround(lv, 1020)).toEqual({ upper: 1050, lower: 1010, upperKind: "callWall", lowerKind: "flip" });
    expect(boxAround({ zones: [], callWall: 1050, putWall: null }, 1000)).toBeNull();
  });

  test("toSpot rescales every level by close / F0", () => {
    const lv: KeyLevels = { zones: [{ low: 100, high: 200, dir: "down" }], callWall: 300, putWall: null };
    expect(toSpot(lv, 1000, 990)).toEqual({ zones: [{ low: 99, high: 198, dir: "down" }], callWall: 297, putWall: null });
  });
});

const bar = (date: string, close: number, open = close, high = close, low = close): Bar => ({ date, open, high, low, close });

function day(date: string, levels: KeyLevels, F0 = 1000): DayResult {
  return { date, F0, sigma: 0.2, levels } as DayResult;
}

