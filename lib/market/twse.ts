/** 證交所「發行量加權股價指數歷史資料」（每月一次查詢，免 API key） */

const TWSE_URL = "https://www.twse.com.tw/indicesReport/MI_5MINS_HIST";

export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TaiexResponse {
  success: boolean;
  data: Bar[] | null;
  error: string | null;
}

/** 民國日期 "115/11/02" → "2026-11-02" */
export function rocToIso(s: string): string | null {
  const m = /^(\d{2,3})\/(\d{2})\/(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return `${+m[1] + 1911}-${m[2]}-${m[3]}`;
}

const toNum = (s: unknown): number => (typeof s === "string" ? Number(s.replace(/,/g, "")) : NaN);

export function parseTaiexJson(json: unknown): Bar[] {
  if (typeof json !== "object" || json === null) return [];
  const { stat, data } = json as { stat?: unknown; data?: unknown };
  if (stat !== "OK" || !Array.isArray(data)) return [];
  return data.flatMap((row): Bar[] => {
    if (!Array.isArray(row) || row.length < 5) return [];
    const date = rocToIso(String(row[0]));
    const [open, high, low, close] = row.slice(1, 5).map(toNum);
    if (!date || [open, high, low, close].some((v) => !Number.isFinite(v))) return [];
    return [{ date, open, high, low, close }];
  });
}

/** 抓某個月的加權指數日 K（monthStart: YYYY-MM-01） */
export async function fetchTaiexMonth(monthStart: string): Promise<Bar[]> {
  const url = `${TWSE_URL}?response=json&date=${monthStart.replace(/-/g, "")}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`證交所回應 HTTP ${res.status}`);
  return parseTaiexJson(await res.json());
}
