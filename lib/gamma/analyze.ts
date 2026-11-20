import { evaluate, NAIVE_WEIGHTS, type GexWeights } from "./evaluate.ts";
import { prepare } from "./prepare.ts";
import type { DayResult, OptionRow, PricedRow } from "./types.ts";

/** 下一個週一至週五（對應 pandas BDay(1)，不含國定假日） */
export function nextBusinessDay(day: number): number {
  let d = day + 1;
  // 1970-01-01 為週四：day % 7 → 0 四, 1 五, 2 六, 3 日
  while (((d % 7) + 7) % 7 === 2 || ((d % 7) + 7) % 7 === 3) d += 1;
  return d;
}

/** 次一交易日變動：以今天「結算後最近到期」合約的遠期價，比較隔天同一到期日的遠期價 */
function nextChange(today: readonly PricedRow[], tomorrow: readonly PricedRow[] | undefined, nextDay: number): number | null {
  if (!tomorrow) return null;
  const post = today.filter((r) => r.exp > nextDay);
  if (post.length === 0) return null;
  const exp = Math.min(...post.map((r) => r.exp));
  const f0 = post.find((r) => r.exp === exp)!.F;
  const f1 = tomorrow.find((r) => r.exp === exp)?.F;
  return f1 === undefined ? null : (f1 / f0 - 1) * 100;
}

export function analyze(rows: readonly OptionRow[], w: GexWeights = NAIVE_WEIGHTS): DayResult[] {
  const priced = prepare(rows);
  const byDate = new Map<number, PricedRow[]>();
  for (const r of priced) {
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }
  const dates = [...byDate.keys()].sort((a, b) => a - b);
  return dates.flatMap((d, i) => {
    const nd = i + 1 < dates.length ? dates[i + 1] : nextBusinessDay(d);
    const res = evaluate(byDate.get(d)!, nd, w);
    if (!res) return [];
    return [{ ...res, nextChange: nextChange(byDate.get(d)!, byDate.get(dates[i + 1]), nd) }];
  });
}
