/**
 * 三大法人資料（免 API key）：
 * - 期交所「三大法人選擇權買賣權分計」（TXO，CSV）
 * - 證交所「三大法人買賣金額統計表」（BFI82U，JSON）
 */

const TAIFEX_CP_URL = "https://www.taifex.com.tw/cht/3/callsAndPutsDateDown";
const TWSE_BFI_URL = "https://www.twse.com.tw/rwd/zh/fund/BFI82U";
const YI = 1e8; // 元 → 億元

export type Institution = "自營商" | "投信" | "外資";

/** 某一身分別在 TXO 的未平倉淨額（口），正＝淨多 */
export interface OptionInstitution {
  who: Institution;
  callNetOi: number;
  putNetOi: number;
}

export interface SpotInstitution {
  who: string;
  /** 買賣超（億元），正＝買超 */
  net: number;
}

const toNum = (s: string | undefined): number => Number((s ?? "").replace(/,/g, "").trim());

const INSTITUTION_ALIASES: Record<string, Institution> = {
  自營商: "自營商",
  投信: "投信",
  外資及陸資: "外資",
  外資: "外資",
};

/** 解析期交所買賣權分計 CSV，只取指定日期（YYYY-MM-DD） */
export function parseOptionInstitutionsCsv(text: string, date: string): OptionInstitution[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((c) => c.trim());
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`期交所法人 CSV 缺少欄位：${name}`);
    return i;
  };
  const iDate = col("日期");
  const iCp = col("買賣權別");
  const iWho = col("身份別");
  const iNet = col("未平倉口數買賣淨額");
  const want = date.replace(/-/g, "/");

  const acc = new Map<Institution, OptionInstitution>();
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f[iDate]?.trim() !== want) continue;
    const who = INSTITUTION_ALIASES[f[iWho]?.trim() ?? ""];
    const net = toNum(f[iNet]);
    const cp = f[iCp]?.trim().toUpperCase();
    if (!who || !Number.isFinite(net) || (cp !== "CALL" && cp !== "PUT")) continue;
    const cur = acc.get(who) ?? { who, callNetOi: 0, putNetOi: 0 };
    acc.set(who, cp === "CALL" ? { ...cur, callNetOi: net } : { ...cur, putNetOi: net });
  }
  return [...acc.values()];
}

/** 解析證交所 BFI82U JSON；stat 不是 OK（例如尚未公布）時回傳空陣列 */
export function parseSpotInstitutionsJson(json: unknown): SpotInstitution[] {
  if (typeof json !== "object" || json === null) return [];
  const { stat, data } = json as { stat?: unknown; data?: unknown };
  if (stat !== "OK" || !Array.isArray(data)) return [];
  return data.flatMap((row): SpotInstitution[] => {
    if (!Array.isArray(row) || row.length < 4) return [];
    const net = toNum(String(row[3]));
    if (!Number.isFinite(net)) return [];
    return [{ who: String(row[0]).trim(), net: Math.round((net / YI) * 100) / 100 }];
  });
}

export async function fetchOptionInstitutions(date: string): Promise<OptionInstitution[]> {
  const d = date.replace(/-/g, "/");
  const body = new URLSearchParams({ queryStartDate: d, queryEndDate: d, commodityId: "TXO" });
  const res = await fetch(TAIFEX_CP_URL, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`期交所法人資料回應 HTTP ${res.status}`);
  const text = new TextDecoder("big5").decode(await res.arrayBuffer());
  if (!text.startsWith("日期")) return []; // 查無資料時回傳 HTML 頁面
  return parseOptionInstitutionsCsv(text, date);
}

export async function fetchSpotInstitutions(date: string): Promise<SpotInstitution[]> {
  const url = `${TWSE_BFI_URL}?type=day&response=json&dayDate=${date.replace(/-/g, "")}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`證交所法人資料回應 HTTP ${res.status}`);
  return parseSpotInstitutionsJson(await res.json());
}
