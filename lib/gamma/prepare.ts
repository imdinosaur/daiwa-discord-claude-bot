import { R, fillByPosition, impliedVol } from "./math.ts";
import type { OptionRow, PricedRow } from "./types.ts";

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** 買賣權平價推遠期價：取 |C − P| 最小的履約價 K₀，F = K₀ + (C − P)·e^(rT) */
export function forwardFromParity(g: readonly OptionRow[]): number {
  const calls = new Map(g.filter((r) => r.cp === "C").map((r) => [r.K, r.px]));
  const puts = new Map(g.filter((r) => r.cp === "P").map((r) => [r.K, r.px]));
  let best: { K: number; diff: number } | null = null;
  const strikes = [...puts.keys()].sort((a, b) => a - b);
  for (const K of strikes) {
    const c = calls.get(K);
    const p = puts.get(K);
    if (c === undefined || p === undefined || Number.isNaN(c) || Number.isNaN(p)) continue;
    const diff = c - p;
    if (best === null || Math.abs(diff) < Math.abs(best.diff)) best = { K, diff };
  }
  if (best === null) return NaN;
  return best.K + best.diff * Math.exp(R * g[0].T);
}

/** 單一 (交易日, 到期日) 群組：推遠期價、反推 IV、相鄰履約價補值 */
function prepareGroup(g: readonly OptionRow[]): PricedRow[] {
  const F = forwardFromParity(g);
  if (Number.isNaN(F)) return [];
  const T = g[0].T;
  const withOi = g.filter((r) => r.OI > 0);

  return (["C", "P"] as const).flatMap((cp) => {
    const side = withOi.filter((r) => r.cp === cp).sort((a, b) => a.K - b.K);
    const raw = side.map((r) => impliedVol(F, r.K, T, r.px, cp));
    const filled = fillByPosition(raw);
    return side.flatMap((r, i) => (Number.isNaN(filled[i]) ? [] : [{ ...r, F, iv: filled[i] }]));
  });
}

export function prepare(rows: readonly OptionRow[]): PricedRow[] {
  const groups = groupBy(rows, (r) => `${r.date}|${r.exp}`);
  return [...groups.values()].flatMap(prepareGroup);
}
