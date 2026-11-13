/**
 * 關鍵價位：GEX 曲線的所有正負轉換點（分水嶺）與買／賣權 GEX 最大的履約價（牆）。
 *
 * 分水嶺區間：「結算後」曲線的每個轉換點，配對「含即將結算部位」曲線上同方向、
 * 距離 ≤ PAIR_MAX_H × h 的轉換點，兩者取 [min, max]。找不到配對就是寬度 0 的單點。
 */
import type { CurvePoint, FlipZone, KeyLevels, StrikeGex } from "./types.ts";

export const PAIR_MAX_H = 0.5;

export interface Crossing {
  level: number;
  /** up：往上走時 GEX 由負轉正（下方放大、上方穩定）；down：往上走時由正轉負 */
  dir: "up" | "down";
}

/** 所有零點，以線性內插求精確位置 */
export function findCrossings(levels: readonly number[], values: readonly number[]): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 1; i < levels.length; i += 1) {
    const [a, b] = [values[i - 1], values[i]];
    if (Math.sign(a) === Math.sign(b) || a === 0) continue;
    const t = a / (a - b);
    out.push({ level: levels[i - 1] + t * (levels[i] - levels[i - 1]), dir: b > a ? "up" : "down" });
  }
  return out;
}

export function buildZones(curve: readonly CurvePoint[], h: number): FlipZone[] {
  const levels = curve.map((p) => p.level);
  const after = findCrossings(levels, curve.map((p) => p.after));
  const now = findCrossings(levels, curve.map((p) => p.now));
  return after.map((c) => {
    const mate = now
      .filter((n) => n.dir === c.dir && Math.abs(n.level - c.level) <= PAIR_MAX_H * h)
      .sort((x, y) => Math.abs(x.level - c.level) - Math.abs(y.level - c.level))[0];
    const pair = mate ? [c.level, mate.level] : [c.level, c.level];
    return { low: Math.min(...pair), high: Math.max(...pair), dir: c.dir };
  });
}

/** 買權牆：F0 以上買權 GEX 最大的履約價；賣權牆：F0 以下賣權 GEX 絕對值最大的履約價 */
export function findWalls(strikes: readonly StrikeGex[], F0: number): Pick<KeyLevels, "callWall" | "putWall"> {
  const above = strikes.filter((s) => s.K >= F0);
  const below = strikes.filter((s) => s.K <= F0);
  const callWall = above.length ? above.reduce((m, s) => (s.call > m.call ? s : m)).K : null;
  const putWall = below.length ? below.reduce((m, s) => (s.put < m.put ? s : m)).K : null;
  return { callWall, putWall };
}

export function keyLevels(curve: readonly CurvePoint[], strikes: readonly StrikeGex[], F0: number, h: number): KeyLevels {
  return { zones: buildZones(curve, h), ...findWalls(strikes, F0) };
}

/** 遠期價座標 → 現貨座標（以「收盤 ÷ F0」等比例換算，與 flip 線相同） */
export function toSpot(levels: KeyLevels, F0: number, close: number): KeyLevels {
  const k = close / F0;
  const s = (x: number | null): number | null => (x === null ? null : x * k);
  return {
    zones: levels.zones.map((z) => ({ ...z, low: z.low * k, high: z.high * k })),
    callWall: s(levels.callWall),
    putWall: s(levels.putWall),
  };
}

export interface Box {
  upper: number;
  lower: number;
  upperKind: LevelKind;
  lowerKind: LevelKind;
}

export type LevelKind = "flip" | "callWall" | "putWall";

/** 把所有價位邊界攤平，取收盤上方最近、下方最近的兩條當作震盪空間 */
export function boxAround(levels: KeyLevels, price: number): Box | null {
  const points: { v: number; kind: LevelKind }[] = [
    ...levels.zones.flatMap((z) => [
      { v: z.low, kind: "flip" as const },
      { v: z.high, kind: "flip" as const },
    ]),
    ...(levels.callWall !== null ? [{ v: levels.callWall, kind: "callWall" as const }] : []),
    ...(levels.putWall !== null ? [{ v: levels.putWall, kind: "putWall" as const }] : []),
  ];
  const up = points.filter((p) => p.v > price).sort((a, b) => a.v - b.v)[0];
  const dn = points.filter((p) => p.v < price).sort((a, b) => b.v - a.v)[0];
  if (!up || !dn) return null;
  return { upper: up.v, lower: dn.v, upperKind: up.kind, lowerKind: dn.kind };
}
