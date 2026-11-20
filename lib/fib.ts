/**
 * 斐波那契回撤：在最近 N 根日 K 內取最高點與最低點當作波段，
 * 依較晚出現的極值判斷方向，算出各比例的回撤價位。
 */
import type { Bar } from "./market/twse.ts";

export const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786] as const;
export const DEFAULT_LOOKBACK = 60; // 交易日

export interface Swing {
  high: number;
  highDate: string;
  low: number;
  lowDate: string;
  /** up：先低後高，回撤價位是下方支撐；down：先高後低，回撤價位是上方壓力 */
  direction: "up" | "down";
}

export interface FibLevel {
  ratio: number;
  price: number;
}

/** bars 須依日期遞增；不足 2 根時回傳 null */
export function findSwing(bars: readonly Bar[], lookback: number = DEFAULT_LOOKBACK): Swing | null {
  const window = bars.slice(-lookback);
  if (window.length < 2) return null;
  const hi = window.reduce((a, b) => (b.high > a.high ? b : a));
  const lo = window.reduce((a, b) => (b.low < a.low ? b : a));
  return {
    high: hi.high,
    highDate: hi.date,
    low: lo.low,
    lowDate: lo.date,
    direction: hi.date >= lo.date ? "up" : "down",
  };
}

export function fibLevels(s: Swing): FibLevel[] {
  const range = s.high - s.low;
  return FIB_RATIOS.map((ratio) => ({
    ratio,
    price: Math.round(s.direction === "up" ? s.high - range * ratio : s.low + range * ratio),
  }));
}
