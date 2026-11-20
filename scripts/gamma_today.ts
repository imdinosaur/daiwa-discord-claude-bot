/**
 * 最新（或指定日）一天的 gamma 快照，輸出 JSON 到 stdout，價位為現貨座標。
 * 用法：npm run gamma-today -- [YYYY-MM-DD]
 */
import { analyze } from "../lib/gamma/analyze.ts";
import { downloadTxo, parseTxoCsv } from "../lib/gamma/taifex.ts";
import type { OptionRow } from "../lib/gamma/types.ts";
import { shiftDate, taipeiToday } from "../lib/format.ts";
import { fetchTaiexMonth, type Bar } from "../lib/market/twse.ts";
import { monthChunks } from "../lib/monthly.ts";
import { snapshot, type InstitutionsView, type SnapshotExtras } from "../lib/snapshot.ts";
import { dealerCalibration } from "../lib/gamma/calibrate.ts";
import { toDayNum } from "../lib/gamma/taifex.ts";
import {
  fetchOptionInstitutions,
  fetchSpotInstitutions,
  type OptionInstitution,
  type SpotInstitution,
} from "../lib/market/institutions.ts";

const LOOKBACK_DAYS = 20; // 回推天數：涵蓋連假，並讓目標日之後的到期日判斷正確

/** 法人資料抓不到時不影響主報告，只在 stderr 記錄原因 */
async function tryFetch<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (e: unknown) {
    process.stderr.write(`${label}抓取失敗：${e instanceof Error ? e.message : String(e)}
`);
    return [];
  }
}

async function extrasFor(rows: readonly OptionRow[], date: string): Promise<SnapshotExtras> {
  const [options, spot]: [OptionInstitution[], SpotInstitution[]] = await Promise.all([
    tryFetch("期交所法人", () => fetchOptionInstitutions(date)),
    tryFetch("證交所法人", () => fetchSpotInstitutions(date)),
  ]);
  const institutions: InstitutionsView | null =
    options.length > 0 || spot.length > 0 ? { options, spot } : null;

  const dayNum = toDayNum(date);
  const cal = dealerCalibration(
    rows.filter((r) => r.date === dayNum),
    options,
  );
  const calDay = cal ? analyze(rows, cal.weights).find((d) => d.date === date) : undefined;
  return { institutions, calibrated: cal && calDay ? { day: calDay, cal } : null };
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error("日期格式需為 YYYY-MM-DD");
  const today = taipeiToday();
  const target = arg ?? today;
  const start = shiftDate(target, -LOOKBACK_DAYS);

  const rows: OptionRow[] = [];
  const bars: Bar[] = [];
  for (const c of monthChunks(start, target, today)) {
    process.stderr.write(`下載 ${c.key}…\n`);
    rows.push(...parseTxoCsv(await downloadTxo(c.start < start ? start : c.start, c.end)));
    bars.push(...(await fetchTaiexMonth(c.start)));
  }

  const day = analyze(rows)
    .filter((d) => d.date <= target)
    .at(-1);
  if (!day) throw new Error(`${start} ~ ${target} 查無期交所 TXO 資料`);
  console.log(JSON.stringify(snapshot(day, bars, await extrasFor(rows, day.date)), null, 2));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
