import { describe, expect, test } from "./helpers/expect.ts";
import { b76, brent, fillByPosition, gamma, impliedVol, normCdf, R } from "../lib/gamma/math.ts";
import { forwardFromParity } from "../lib/gamma/prepare.ts";
import { classify, findFlip, linspace } from "../lib/gamma/evaluate.ts";
import { nextBusinessDay, analyze } from "../lib/gamma/analyze.ts";
import { parseTxoCsv, toDayNum, fromDayNum } from "../lib/gamma/taifex.ts";
import type { OptionRow } from "../lib/gamma/types.ts";

describe("math", () => {
  test("normCdf matches known values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(normCdf(-1)).toBeCloseTo(0.1586553, 6);
  });

  test("Black-76 satisfies put-call parity", () => {
    const [F, K, T, s] = [42000, 41500, 0.05, 0.4];
    const parity = Math.exp(-R * T) * (F - K);
    expect(b76(F, K, T, s, "C") - b76(F, K, T, s, "P")).toBeCloseTo(parity, 4);
  });

  test("impliedVol round-trips a Black-76 price", () => {
    const px = b76(42000, 43000, 0.03, 0.35, "C");
    expect(impliedVol(42000, 43000, 0.03, px, "C")).toBeCloseTo(0.35, 5);
  });

  test("impliedVol returns NaN at or below intrinsic + 0.05", () => {
    // 折現內含價值 = 1000·e^(−rT) ≈ 999.49
    expect(impliedVol(42000, 41000, 0.03, 999.5, "C")).toBeNaN();
  });

  test("brent returns NaN when the bracket has no sign change", () => {
    expect(brent((x) => x * x + 1, -1, 1)).toBeNaN();
  });

  test("gamma is positive and peaks near the money", () => {
    expect(gamma(42000, 42000, 0.05, 0.4)).toBeGreaterThan(gamma(42000, 46000, 0.05, 0.4));
  });

  test("fillByPosition interpolates, then back/forward fills", () => {
    expect(fillByPosition([NaN, 1, NaN, 3, NaN])).toEqual([1, 1, 2, 3, 3]);
    expect(fillByPosition([NaN, NaN])).toEqual([NaN, NaN]);
  });
});

describe("evaluate helpers", () => {
  test("classify follows the light rules in order", () => {
    expect(classify({ G_up: 10, G_dn: -5, A: 0.8, flip_dist: null, cliff: null })).toBe("red");
    expect(classify({ G_up: 10, G_dn: 5, A: 0.3, flip_dist: 0.5, cliff: null })).toBe("yellow");
    expect(classify({ G_up: 10, G_dn: 5, A: 0.3, flip_dist: 2, cliff: 0.8 })).toBe("yellow");
    expect(classify({ G_up: -3, G_dn: 5, A: -1, flip_dist: -0.5, cliff: 0.1 })).toBe("blue");
    expect(classify({ G_up: 10, G_dn: 8, A: 0.1, flip_dist: 2, cliff: 0 })).toBe("green");
  });

  test("findFlip picks the sign change nearest to F0", () => {
    const scan = linspace(0, 10, 11);
    const prof = scan.map((x) => (x < 3 || x > 8 ? -1 : 1));
    expect(findFlip(scan, prof, 7)).toBe(9);
    expect(findFlip(scan, prof, 4)).toBe(3);
    expect(findFlip(scan, scan.map(() => 1), 5)).toBeNull();
  });
});

describe("taifex parsing", () => {
  const header =
    "交易日期,契約,到期月份(週別),履約價,買賣權,開盤價,最高價,最低價,收盤價,成交量,結算價,未沖銷契約數,最後最佳買價,最後最佳賣價,歷史最高價,歷史最低價,是否因訊息面暫停交易,交易時段,漲跌價,漲跌%,契約到期日,";
  const row = (cp: string, px: string, sess = "一般", exp = "20261118") =>
    `2026/11/10,TXO,202611W3,42000.0000,${cp},-,-,-,-,0,${px},120,-,-,-,-,,${sess},-,-,${exp}`;

  test("keeps only regular session rows with T > 0", () => {
    const rows = parseTxoCsv([header, row("買權", "500"), row("賣權", "-", "盤後"), row("賣權", "450", "一般", "20261110")].join("\n"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cp: "C", K: 42000, px: 500, OI: 120 });
    expect(rows[0].T).toBeCloseTo((8 - 0.25) / 365, 10);
  });

  test("day number round-trips", () => {
    expect(fromDayNum(toDayNum("2026/11/10"))).toBe("2026-11-10");
  });

  test("nextBusinessDay skips weekends", () => {
    expect(fromDayNum(nextBusinessDay(toDayNum("20261106")))).toBe("2026-11-09"); // 週五 → 週一
    expect(fromDayNum(nextBusinessDay(toDayNum("20261110")))).toBe("2026-11-11");
  });
});

describe("pipeline on synthetic chain", () => {
  const date = toDayNum("20261110");
  const F = 42000;
  const sigma = 0.4;
  const chain = (exp: number, oiCall: number, oiPut: number): OptionRow[] => {
    const T = (exp - date - 0.25) / 365;
    return linspace(38000, 46000, 33).flatMap((K) =>
      (["C", "P"] as const).map((cp) => ({
        date,
        exp,
        K,
        cp,
        px: b76(F, K, T, sigma, cp),
        OI: cp === "C" ? oiCall : oiPut,
        T,
      }))
    );
  };

  test("forwardFromParity recovers the forward", () => {
    expect(forwardFromParity(chain(toDayNum("20261118"), 1, 1))).toBeCloseTo(F, 3);
  });

  test("call-heavy book gives positive GEX and a non-red light", () => {
    const [day] = analyze(chain(toDayNum("20261118"), 5000, 1000));
    expect(day.F0).toBeCloseTo(F, 2);
    expect(day.sigma).toBeCloseTo(sigma, 3);
    expect(day.G_after).toBeGreaterThan(0);
    expect(day.light).not.toBe("red");
  });

  test("expiry on the next trading day is excluded after settlement", () => {
    const rows = [...chain(toDayNum("20261111"), 9000, 100), ...chain(toDayNum("20261118"), 100, 3000)];
    const [day] = analyze(rows);
    expect(day.settlingExpiries).toEqual(["2026-11-11"]);
    expect(day.G_now).toBeGreaterThan(0);
    expect(day.G_after).toBeLessThan(0);
    expect(day.cliff).toBeGreaterThan(1);
  });
});
