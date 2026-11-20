/**
 * 法人校正：用期交所「三大法人選擇權買賣權分計」的自營商淨未平倉，
 * 估計造市商在買權、賣權各持有多少比例的多（正）／空（負）單。
 *
 * 限制：法人資料只有全部 TXO 合計，沒有分履約價與到期日，
 * 所以這裡假設自營商的部位按未平倉量平均分布在每個履約價上。
 */
import type { GexWeights } from "./evaluate.ts";
import type { OptionRow } from "./types.ts";
import type { OptionInstitution } from "../market/institutions.ts";

/** 造市商的代理身分別 */
export const DEALER = "自營商";

export interface DealerCalibration {
  weights: GexWeights;
  dealerCallNetOi: number;
  dealerPutNetOi: number;
  totalCallOi: number;
  totalPutOi: number;
}

/** rows 須為同一交易日的 TXO 部位；查無自營商資料或未平倉為 0 時回傳 null */
export function dealerCalibration(
  rows: readonly OptionRow[],
  institutions: readonly OptionInstitution[],
): DealerCalibration | null {
  const dealer = institutions.find((i) => i.who === DEALER);
  if (!dealer) return null;
  const totalCallOi = rows.filter((r) => r.cp === "C").reduce((s, r) => s + r.OI, 0);
  const totalPutOi = rows.filter((r) => r.cp === "P").reduce((s, r) => s + r.OI, 0);
  if (totalCallOi <= 0 || totalPutOi <= 0) return null;
  return {
    weights: { C: dealer.callNetOi / totalCallOi, P: dealer.putNetOi / totalPutOi },
    dealerCallNetOi: dealer.callNetOi,
    dealerPutNetOi: dealer.putNetOi,
    totalCallOi,
    totalPutOi,
  };
}
