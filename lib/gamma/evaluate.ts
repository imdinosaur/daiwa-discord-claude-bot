import { MULT, gamma } from "./math.ts";
import { fromDayNum } from "./taifex.ts";
import { keyLevels } from "./levels.ts";
import type { CurvePoint, DayResult, Light, PricedRow, StrikeGex } from "./types.ts";

export const N_DAYS = 3; // 評估視窗：幾個日曆日的預期波動
export const GRID = 41; // 視窗內取樣點數
const SCAN_POINTS = 241; // flip 掃描點數（F0 ± 3h）
const CURVE_POINTS = 121; // 前端曲線點數

export const THRESHOLDS = { A: 0.5, flipDist: 1, cliff: 0.7 } as const;

/**
 * 造市商在每一口未平倉上的部位比例（正＝持有多單）。
 * 預設假設造市商持有全部買權多單、賣權空單；法人校正版改用期交所自營商淨未平倉推得的比例。
 */
export interface GexWeights {
  C: number;
  P: number;
}

export const NAIVE_WEIGHTS: GexWeights = { C: 1, P: -1 };

/** 單一部位在指數 L 時的 GEX（億元 / 指數變動 1%），預設權重下買權正、賣權負 */
function rowGex(r: PricedRow, L: number, F0: number, w: GexWeights): number {
  const F = r.F * (L / F0);
  const G = (gamma(F, r.K, r.T, r.iv) * r.OI * MULT * F * F * 0.01) / 1e8;
  return w[r.cp] * G;
}

export function gexAt(rows: readonly PricedRow[], L: number, F0: number, w: GexWeights = NAIVE_WEIGHTS): number {
  let sum = 0;
  for (const r of rows) sum += rowGex(r, L, F0, w);
  return sum;
}

export function gexProfile(
  rows: readonly PricedRow[],
  levels: readonly number[],
  F0: number,
  w: GexWeights = NAIVE_WEIGHTS,
): number[] {
  return levels.map((L) => gexAt(rows, L, F0, w));
}

export function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));
}

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** 最靠近 F0 的正負轉換點（對應 np.sign 相鄰不同） */
export function findFlip(scan: readonly number[], prof: readonly number[], F0: number): number | null {
  const flips = scan.filter((_, i) => i > 0 && Math.sign(prof[i]) !== Math.sign(prof[i - 1]));
  if (flips.length === 0) return null;
  return flips.reduce((best, x) => (Math.abs(x - F0) < Math.abs(best - F0) ? x : best));
}

export interface LightInput {
  G_up: number;
  G_dn: number;
  A: number;
  flip_dist: number | null;
  cliff: number | null;
}

export function classify({ G_up, G_dn, A, flip_dist, cliff }: LightInput): Light {
  if (G_dn < 0 && G_up > 0 && A >= THRESHOLDS.A) return "red";
  if (
    G_dn < 0 ||
    (flip_dist !== null && flip_dist >= 0 && flip_dist <= THRESHOLDS.flipDist) ||
    (cliff !== null && cliff >= THRESHOLDS.cliff)
  )
    return "yellow";
  if (G_up < 0 && G_dn > 0) return "blue";
  return "green";
}

function strikeBreakdown(post: readonly PricedRow[], F0: number, h: number, w: GexWeights): StrikeGex[] {
  const m = new Map<number, StrikeGex>();
  for (const r of post) {
    if (Math.abs(r.K - F0) > 3 * h) continue;
    const g = rowGex(r, F0, F0, w);
    const cur = m.get(r.K) ?? { K: r.K, call: 0, put: 0 };
    m.set(r.K, r.cp === "C" ? { ...cur, call: cur.call + g } : { ...cur, put: cur.put + g });
  }
  return [...m.values()].sort((a, b) => a.K - b.K);
}

/** 對單一交易日的部位計算警報指標；nextDay 為下一交易日（UTC 日序號） */
export function evaluate(g: readonly PricedRow[], nextDay: number, w: GexWeights = NAIVE_WEIGHTS): DayResult | null {
  if (g.length === 0) return null;
  const frontExp = Math.min(...g.map((r) => r.exp));
  const F0 = g.find((r) => r.exp === frontExp)!.F;

  const post = g.filter((r) => r.exp > nextDay);
  if (post.length === 0) return null;
  const nearExp = Math.min(...post.map((r) => r.exp));
  const near = post.filter((r) => r.exp === nearExp);
  const atm = [...near].sort((a, b) => Math.abs(a.K - a.F) - Math.abs(b.K - b.F)).slice(0, 4);
  const sigma = mean(atm.map((r) => r.iv));
  const h = F0 * sigma * Math.sqrt(N_DAYS / 365);

  const G_up = mean(gexProfile(post, linspace(F0, F0 + h, GRID), F0, w));
  const G_dn = mean(gexProfile(post, linspace(F0 - h, F0, GRID), F0, w));
  const A = (G_up - G_dn) / (Math.abs(G_up) + Math.abs(G_dn) + 1e-9);

  const G_now = gexAt(g, F0, F0, w);
  const G_after = gexAt(post, F0, F0, w);
  const cliff = G_now > 0 ? 1 - G_after / G_now : null;

  const scan = linspace(F0 - 3 * h, F0 + 3 * h, SCAN_POINTS);
  const flip = findFlip(scan, gexProfile(post, scan, F0, w), F0);
  const flip_dist = flip === null ? null : (F0 - flip) / h;

  const curveLevels = linspace(F0 - 3 * h, F0 + 3 * h, CURVE_POINTS);
  const curve: CurvePoint[] = curveLevels.map((level) => ({
    level,
    now: gexAt(g, level, F0, w),
    after: gexAt(post, level, F0, w),
  }));

  const strikes = strikeBreakdown(post, F0, h, w);
  const settling = [...new Set(g.filter((r) => r.exp <= nextDay).map((r) => r.exp))].sort((a, b) => a - b);

  return {
    date: fromDayNum(g[0].date),
    nextDay: fromDayNum(nextDay),
    F0,
    sigma,
    h,
    G_now,
    G_after,
    cliff,
    G_up,
    G_dn,
    A,
    flip,
    flip_dist,
    light: classify({ G_up, G_dn, A, flip_dist, cliff }),
    settlingExpiries: settling.map(fromDayNum),
    curve,
    strikes,
    levels: keyLevels(curve, strikes, F0, h),
    nextChange: null,
  };
}
