/**
 * 加權指數日 K／週 K 均線乖離率，摘要 JSON 輸出到 stdout，完整序列寫到 output/taiex_series.json（畫圖用）。
 *
 * 用法：node scripts/taiex_bias.ts [--since YYYY-MM] [--ma 36] [--compare YYYY-MM[:YYYY-MM]] [--date YYYY-MM-DD]
 *   --since    抓取起始月（預設 2024-01；週均線需要約 n 週的暖身資料）
 *   --ma       均線期數（日、週共用，預設 36）
 *   --compare  對照期間，例如 2025-04 或 2025-03:2025-05
 *   --date     截止日（預設今天）
 *
 * 已結束的月份會快取在 output/cache/，重跑時不會重抓。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { taipeiToday } from "../lib/format.ts";
import { fetchTaiexMonth, type Bar } from "../lib/market/twse.ts";
import { monthChunks } from "../lib/monthly.ts";
import { extremesIn, toWeekly, withBias, type StatBar } from "../lib/market/taiex_stats.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "output");
const CACHE_DIR = path.join(OUT_DIR, "cache");
const REQUEST_GAP_MS = 600; // 證交所有頻率限制
const MAX_TRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`參數錯誤：${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

async function fetchMonth(monthStart: string, isClosed: boolean): Promise<Bar[]> {
  const file = path.join(CACHE_DIR, `taiex_${monthStart.slice(0, 7)}.json`);
  if (isClosed && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as Bar[];
  for (let tries = 1; ; tries++) {
    try {
      const bars = await fetchTaiexMonth(monthStart);
      if (isClosed && bars.length > 0) fs.writeFileSync(file, JSON.stringify(bars));
      await sleep(REQUEST_GAP_MS);
      return bars;
    } catch (e: unknown) {
      if (tries >= MAX_TRIES) throw e;
      await sleep(REQUEST_GAP_MS * 5);
    }
  }
}

const pick = (r: StatBar | undefined) =>
  r && { date: r.date, start: r.start, close: r.close, low: r.low, ma: r.ma && Math.round(r.ma * 100) / 100, bias: r.bias && Math.round(r.bias * 100) / 100 };

function monthRange(spec: string): [string, string] {
  const [a, b = a] = spec.split(":");
  if (!/^\d{4}-\d{2}$/.test(a) || !/^\d{4}-\d{2}$/.test(b)) throw new Error("--compare 格式需為 YYYY-MM 或 YYYY-MM:YYYY-MM");
  const [y, m] = b.split("-").map(Number);
  return [`${a}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const since = args.since ?? "2024-01";
  const n = Number(args.ma ?? 36);
  const today = taipeiToday();
  const end = args.date ?? today;
  if (!/^\d{4}-\d{2}$/.test(since)) throw new Error("--since 格式需為 YYYY-MM");
  if (!Number.isInteger(n) || n < 2 || n > 250) throw new Error("--ma 需為 2～250 的整數");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error("--date 格式需為 YYYY-MM-DD");

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const bars: Bar[] = [];
  for (const c of monthChunks(`${since}-01`, end, today)) {
    process.stderr.write(`讀取 ${c.key}…\n`);
    bars.push(...(await fetchMonth(c.start, c.key < today.slice(0, 7))));
  }
  const upTo = bars.filter((b) => b.date <= end);
  if (upTo.length === 0) throw new Error("查無加權指數資料");

  const daily: StatBar[] = withBias(upTo, n);
  const weekly: StatBar[] = withBias(toWeekly(upTo), n);
  fs.writeFileSync(path.join(OUT_DIR, "taiex_series.json"), JSON.stringify({ ma: n, daily, weekly }));

  const compare = args.compare
    ? (() => {
        const [from, to] = monthRange(args.compare);
        const d = extremesIn(daily, from, to);
        const w = extremesIn(weekly, from, to);
        return {
          from,
          to,
          dailyLowestClose: pick(d?.lowestClose),
          dailyDeepestBias: pick(d?.deepestBias),
          weeklyLowestClose: pick(w?.lowestClose),
          weeklyDeepestBias: pick(w?.deepestBias),
        };
      })()
    : null;

  console.log(
    JSON.stringify(
      { ma: n, latestDaily: pick(daily.at(-1)), latestWeekly: pick(weekly.at(-1)), compare, series: "output/taiex_series.json" },
      null,
      2,
    ),
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
