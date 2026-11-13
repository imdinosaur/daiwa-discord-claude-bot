/**
 * 單日 gamma 快照：把 DayResult 整理成給命令列／其他工具讀的 JSON，價位全部換成現貨座標。
 */
import { boxAround, toSpot } from "./gamma/levels.ts";
import type { DayResult, FlipZone, Light } from "./gamma/types.ts";
import { LIGHT_META, gammaRegime } from "./format.ts";
import type { Bar } from "./market/twse.ts";

export const CONE_HORIZONS = [1, 3, 5, 7] as const; // 日曆日
const SIGMAS = [1, 2] as const;

export interface ConeBand {
  days: number;
  k: number;
  lower: number;
  upper: number;
}

export interface GammaSnapshot {
  date: string;
  nextDay: string;
  light: Light;
  lightLabel: string;
  action: string;
  regime: { positive: boolean; label: string; matchesFlipLine: boolean };
  /** close：證交所加權指數收盤；F0：查無收盤時以遠期價代替 */
  priceSource: "close" | "F0";
  close: number;
  F0: number;
  sigma: number;
  /** 3 日曆日預期波動（現貨點數） */
  h: number;
  A: number;
  G_up: number;
  G_dn: number;
  cliff: number | null;
  flip: number | null;
  flip_dist: number | null;
  settlingExpiries: string[];
  zones: FlipZone[];
  callWall: number | null;
  putWall: number | null;
  box: { lower: number; upper: number; lowerKind: string; upperKind: string } | null;
  cone: ConeBand[];
}

const r0 = (x: number): number => Math.round(x);
const r0n = (x: number | null): number | null => (x === null ? null : r0(x));
const r2 = (x: number): number => Math.round(x * 100) / 100;

export function snapshot(day: DayResult, bars: readonly Bar[]): GammaSnapshot {
  const bar = bars.find((b) => b.date === day.date);
  const close = bar?.close ?? day.F0;
  const k = close / day.F0;
  const lv = toSpot(day.levels, day.F0, close);
  const box = boxAround(lv, close);
  const meta = LIGHT_META[day.light];
  const regime = gammaRegime(day);

  return {
    date: day.date,
    nextDay: day.nextDay,
    light: day.light,
    lightLabel: meta.label,
    action: meta.action,
    regime: { positive: regime.positive, label: regime.label, matchesFlipLine: regime.matchesFlipLine },
    priceSource: bar ? "close" : "F0",
    close: r2(close),
    F0: r2(day.F0),
    sigma: Math.round(day.sigma * 1000) / 1000,
    h: r0(day.h * k),
    A: r2(day.A),
    G_up: r2(day.G_up),
    G_dn: r2(day.G_dn),
    cliff: day.cliff === null ? null : r2(day.cliff),
    flip: day.flip === null ? null : r0(day.flip * k),
    flip_dist: day.flip_dist === null ? null : r2(day.flip_dist),
    settlingExpiries: day.settlingExpiries,
    zones: lv.zones.map((z) => ({ ...z, low: r0(z.low), high: r0(z.high) })),
    callWall: r0n(lv.callWall),
    putWall: r0n(lv.putWall),
    box: box && { lower: r0(box.lower), upper: r0(box.upper), lowerKind: box.lowerKind, upperKind: box.upperKind },
    cone: CONE_HORIZONS.flatMap((days) =>
      SIGMAS.map((s) => {
        const move = s * day.sigma * Math.sqrt(days / 365);
        return { days, k: s, lower: r0(close * (1 - move)), upper: r0(close * (1 + move)) };
      })
    ),
  };
}
