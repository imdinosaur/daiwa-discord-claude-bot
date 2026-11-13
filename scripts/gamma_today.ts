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
import { snapshot } from "../lib/snapshot.ts";

const LOOKBACK_DAYS = 20; // 回推天數：涵蓋連假，並讓目標日之後的到期日判斷正確

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
  console.log(JSON.stringify(snapshot(day, bars), null, 2));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
