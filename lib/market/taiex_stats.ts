/**
 * 加權指數均線乖離：日 K 均線、日 K 彙整成週 K、乖離率。
 * 乖離率 = 收盤 / N 期均線 − 1（%）。
 */
import type { Bar } from "./twse.ts";

export interface StatBar extends Bar {
  /** 週 K 才有：該週第一個交易日 */
  start?: string;
  ma: number | null;
  bias: number | null;
}

const isoWeekKey = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // 週一＝0
  const thursday = new Date(d.getTime() + (3 - day) * 86_400_000);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.floor((thursday.getTime() - yearStart) / (7 * 86_400_000)) + 1;
  return `${thursday.getUTCFullYear()}-W${week}`;
};

/** bars 須依日期遞增；date 為該週最後一個交易日 */
export function toWeekly(bars: readonly Bar[]): (Bar & { start: string })[] {
  const weeks = new Map<string, Bar & { start: string }>();
  for (const b of bars) {
    const key = isoWeekKey(b.date);
    const w = weeks.get(key);
    weeks.set(
      key,
      w
        ? { ...w, date: b.date, high: Math.max(w.high, b.high), low: Math.min(w.low, b.low), close: b.close }
        : { ...b, start: b.date },
    );
  }
  return [...weeks.values()];
}

/** 以收盤價計算 n 期均線與乖離率（%），不足 n 期為 null */
export function withBias<T extends Bar>(bars: readonly T[], n: number): (T & { ma: number | null; bias: number | null })[] {
  let sum = 0;
  return bars.map((b, i) => {
    sum += b.close;
    if (i >= n) sum -= bars[i - n].close;
    if (i + 1 < n) return { ...b, ma: null, bias: null };
    const ma = sum / n;
    return { ...b, ma, bias: (b.close / ma - 1) * 100 };
  });
}

/** 期間內收盤最低的那根，與乖離最深的那根 */
export function extremesIn(
  rows: readonly StatBar[],
  from: string,
  to: string,
): { lowestClose: StatBar; deepestBias: StatBar } | null {
  const inRange = rows.filter((r) => (r.start ?? r.date) <= to && r.date >= from && r.bias !== null);
  if (inRange.length === 0) return null;
  return {
    lowestClose: inRange.reduce((a, b) => (b.close < a.close ? b : a)),
    deepestBias: inRange.reduce((a, b) => (b.bias! < a.bias! ? b : a)),
  };
}
