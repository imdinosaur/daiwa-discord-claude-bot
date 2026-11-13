import type { OptionRow } from "./types.ts";

const TAIFEX_URL = "https://www.taifex.com.tw/cht/3/dlOptDataDown";
const DAY_MS = 86_400_000;

/** "2026/11/09" 或 "20261109" → UTC 日序號 */
export function toDayNum(s: string): number {
  const t = s.trim().replace(/\//g, "").replace(/-/g, "");
  if (!/^\d{8}$/.test(t)) return NaN;
  return Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8)) / DAY_MS;
}

export function fromDayNum(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** 下載期交所 TXO 日資料（Big5 CSV），回傳 UTF-8 文字 */
export async function downloadTxo(start: string, end: string): Promise<string> {
  const body = new URLSearchParams({
    down_type: "1",
    commodity_id: "TXO",
    commodity_id2: "",
    queryStartDate: start.replace(/-/g, "/"),
    queryEndDate: end.replace(/-/g, "/"),
  });
  const res = await fetch(TAIFEX_URL, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`期交所回應 HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("big5").decode(buf);
  if (!text.startsWith("交易日期")) {
    throw new Error("期交所未回傳 CSV（可能查無資料或日期區間超過限制）");
  }
  return text;
}

const num = (s: string | undefined): number => {
  const t = (s ?? "").trim();
  return t === "" || t === "-" ? NaN : Number(t);
};

/** 解析 CSV，只取一般交易時段、T > 0 的列 */
export function parseTxoCsv(text: string): OptionRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((c) => c.trim());
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`CSV 缺少欄位：${name}`);
    return i;
  };
  const iDate = col("交易日期");
  const iK = col("履約價");
  const iCp = col("買賣權");
  const iPx = col("結算價");
  const iOi = col("未沖銷契約數");
  const iSess = col("交易時段");
  const iExp = col("契約到期日");

  return lines.slice(1).flatMap((line): OptionRow[] => {
    const f = line.split(",");
    if (f[iSess]?.trim() !== "一般") return [];
    const date = toDayNum(f[iDate]);
    const exp = toDayNum(f[iExp]);
    const K = num(f[iK]);
    if (Number.isNaN(date) || Number.isNaN(exp) || Number.isNaN(K)) return [];
    const T = (exp - date - 0.25) / 365;
    if (!(T > 0)) return [];
    const oi = num(f[iOi]);
    return [
      {
        date,
        exp,
        K,
        cp: f[iCp]?.trim() === "買權" ? "C" : "P",
        px: num(f[iPx]),
        OI: Number.isNaN(oi) ? 0 : oi,
        T,
      },
    ];
  });
}
