/** 依月份分段：期交所／證交所的查詢都以「一個月」為單位比較穩定 */

export interface MonthChunk {
  key: string; // YYYY-MM
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD（不超過 today）
}

/** 將 [start, end] 拆成整月區段（各段為該月 1 日至月底或 today） */
export function monthChunks(start: string, end: string, today: string): MonthChunk[] {
  const chunks: MonthChunk[] = [];
  let y = +start.slice(0, 4);
  let m = +start.slice(5, 7);
  const endKey = end.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > endKey) break;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const chunkEnd = last < today ? last : today;
    if (`${key}-01` <= chunkEnd) chunks.push({ key, start: `${key}-01`, end: chunkEnd });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return chunks;
}
