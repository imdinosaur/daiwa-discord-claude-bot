import type { CallPut } from "./math.ts";

/** 期交所 CSV 一列（只保留一般交易時段、T > 0） */
export interface OptionRow {
  date: number; // 交易日（UTC 日序號）
  exp: number; // 契約到期日（UTC 日序號）
  K: number;
  cp: CallPut;
  px: number; // 結算價，可能 NaN
  OI: number;
  T: number; // 年
}

/** 已推算遠期價與 IV 的部位 */
export interface PricedRow extends OptionRow {
  F: number;
  iv: number;
}

export type Light = "red" | "yellow" | "blue" | "green";

export interface CurvePoint {
  level: number;
  now: number; // 含即將結算的部位
  after: number; // 結算後
}

export interface StrikeGex {
  K: number;
  call: number; // 億元，正
  put: number; // 億元，負
}

export interface FlipZone {
  low: number;
  high: number;
  /** up：往上穿越時 GEX 由負轉正；down：由正轉負 */
  dir: "up" | "down";
}

export interface KeyLevels {
  zones: FlipZone[];
  callWall: number | null;
  putWall: number | null;
}

export interface DayResult {
  date: string; // YYYY-MM-DD
  nextDay: string;
  F0: number;
  sigma: number;
  h: number;
  G_now: number;
  G_after: number;
  cliff: number | null;
  G_up: number;
  G_dn: number;
  A: number;
  flip: number | null;
  flip_dist: number | null;
  light: Light;
  settlingExpiries: string[]; // 下一交易日（含）前到期、被剔除的到期日
  curve: CurvePoint[];
  strikes: StrikeGex[]; // 結算後部位、在 F0 的各履約價 GEX
  levels: KeyLevels; // 遠期價座標
  nextChange: number | null; // 次一交易日近月遠期價變動（%）
}

export interface GammaResponse {
  success: boolean;
  data: { start: string; end: string; days: DayResult[] } | null;
  error: string | null;
}
