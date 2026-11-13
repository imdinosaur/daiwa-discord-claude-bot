import type { DayResult, Light } from "./gamma/types.ts";

export interface LightMeta {
  label: string;
  action: string;
  detail: string;
}

export const LIGHT_META: Record<Light, LightMeta> = {
  red: {
    label: "紅燈",
    action: "減碼",
    detail: "下方負 gamma、上方正 gamma：下跌會被放大，上漲會被壓抑。",
  },
  yellow: {
    label: "黃燈",
    action: "警戒",
    detail: "下方已是負 gamma、flip 在一個預期波動內，或結算後緩衝將大幅消失。",
  },
  blue: {
    label: "藍燈",
    action: "上行較易",
    detail: "上方負 gamma、下方正 gamma。僅供參考，本警報器不據此加碼。",
  },
  green: {
    label: "綠燈",
    action: "對稱",
    detail: "上下風險大致對稱，造市商避險不明顯偏向任一方向。",
  },
};

/** 台北時間今天 YYYY-MM-DD */
export function taipeiToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export interface GammaRegime {
  positive: boolean;
  label: string;
  detail: string;
  /** false＝與紅線位置不一致（多個 flip 或由正轉負的 flip），不能只看紅線 */
  matchesFlipLine: boolean;
}

/** 收盤處的 gamma 狀態：直接看結算後部位在 F0 的 GEX 正負號，不依賴 flip 的方向 */
export function gammaRegime(day: Pick<DayResult, "G_after" | "flip_dist">): GammaRegime {
  const positive = day.G_after > 0;
  const matchesFlipLine = day.flip_dist === null || day.flip_dist >= 0 === positive;
  return {
    positive,
    label: positive ? "收盤處為正 gamma" : "收盤處為負 gamma",
    detail: positive ? "造市商逆勢避險，波動傾向被壓低" : "造市商順勢避險，波動傾向被放大",
    matchesFlipLine,
  };
}
