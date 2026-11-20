/**
 * 加權指數斐波那契回撤，輸出 JSON 到 stdout（含畫圖用的日 K）。
 * 用法：node scripts/fib_today.ts [YYYY-MM-DD] [lookback]
 */
import { shiftDate, taipeiToday } from "../lib/format.ts";
import { fetchTaiexMonth, type Bar } from "../lib/market/twse.ts";
import { monthChunks } from "../lib/monthly.ts";
import { DEFAULT_LOOKBACK, fibLevels, findSwing } from "../lib/fib.ts";

const CALENDAR_DAYS_PER_TRADING_DAY = 1.6; // 換算回推日曆天數，涵蓋週末與連假

async function main(): Promise<void> {
  const [dateArg, lookbackArg] = process.argv.slice(2);
  if (dateArg !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) throw new Error("日期格式需為 YYYY-MM-DD");
  const lookback = lookbackArg === undefined ? DEFAULT_LOOKBACK : Number(lookbackArg);
  if (!Number.isInteger(lookback) || lookback < 5 || lookback > 250) throw new Error("lookback 需為 5～250 的整數");

  const today = taipeiToday();
  const target = dateArg ?? today;
  const start = shiftDate(target, -Math.ceil(lookback * CALENDAR_DAYS_PER_TRADING_DAY) - 10);

  const bars: Bar[] = [];
  for (const c of monthChunks(start, target, today)) {
    process.stderr.write(`下載 ${c.key}…\n`);
    bars.push(...(await fetchTaiexMonth(c.start)));
  }
  const window = bars.filter((b) => b.date <= target).slice(-lookback);
  const swing = findSwing(window, lookback);
  if (!swing) throw new Error(`${target} 之前的加權指數資料不足`);

  console.log(
    JSON.stringify({ date: window.at(-1)!.date, lookback, swing, levels: fibLevels(swing), bars: window }, null, 2),
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
