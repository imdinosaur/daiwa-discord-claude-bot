import { describe, expect, test } from "./helpers/expect.ts";
import { snapshot } from "../lib/snapshot.ts";
import type { DayResult } from "../lib/gamma/types.ts";
import type { Bar } from "../lib/market/twse.ts";

const day: DayResult = {
  date: "2026-11-12",
  nextDay: "2026-11-13",
  F0: 40000,
  sigma: 0.365,
  h: 1200,
  G_now: 5,
  G_after: -2,
  cliff: null,
  G_up: 7,
  G_dn: -9,
  A: 1,
  flip: 40400,
  flip_dist: -0.33,
  light: "red",
  settlingExpiries: [],
  curve: [],
  strikes: [],
  levels: { zones: [{ low: 40400, high: 40600, dir: "up" }], callWall: 42000, putWall: 38000 },
  nextChange: null,
};

const bar = (date: string, close: number): Bar => ({ date, open: close, high: close, low: close, close });

describe("snapshot", () => {
  test("converts forward-price levels to spot using close / F0", () => {
    const s = snapshot(day, [bar("2026-11-12", 39600)]); // k = 0.99
    expect(s.priceSource).toBe("close");
    expect(s.flip).toBe(39996);
    expect(s.zones).toEqual([{ low: 39996, high: 40194, dir: "up" }]);
    expect(s.callWall).toBe(41580);
    expect(s.putWall).toBe(37620);
    expect(s.h).toBe(1188);
  });

  test("box takes the nearest level above and below the close", () => {
    const s = snapshot(day, [bar("2026-11-12", 39600)]);
    expect(s.box).toEqual({ lower: 37620, upper: 39996, lowerKind: "putWall", upperKind: "flip" });
  });

  test("falls back to F0 when the TAIEX close is missing", () => {
    const s = snapshot(day, [bar("2026-11-11", 39000)]);
    expect(s.priceSource).toBe("F0");
    expect(s.close).toBe(40000);
    expect(s.flip).toBe(40400);
  });

  test("cone widens with sqrt(days) and k", () => {
    const s = snapshot(day, [bar("2026-11-12", 40000)]);
    const one = s.cone.find((c) => c.days === 1 && c.k === 1)!;
    const move = 0.365 * Math.sqrt(1 / 365); // ≈ 1.91%
    expect(one.upper).toBe(Math.round(40000 * (1 + move)));
    expect(one.lower).toBe(Math.round(40000 * (1 - move)));
    expect(s.cone).toHaveLength(8);
  });

  test("carries light label and regime", () => {
    const s = snapshot(day, []);
    expect(s.lightLabel).toBe("紅燈");
    expect(s.action).toBe("減碼");
    expect(s.regime.positive).toBe(false);
    expect(s.regime.matchesFlipLine).toBe(true);
  });
});
