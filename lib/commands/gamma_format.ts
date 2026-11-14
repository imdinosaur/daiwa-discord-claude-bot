/**
 * /gamma 的回覆格式，沿用 bots/claude-ojousama/skills/gamma_report.md 的發送格式，
 * 數字照快照 JSON，不另外推測。
 */
import type { GammaSnapshot } from "../snapshot.ts";

const KIND_LABEL: Record<string, string> = { flip: "flip", callWall: "買權牆", putWall: "賣權牆" };
const DISCLAIMER = "本報告為選擇權結構分析，不構成投資建議。";

const num = (x: number): string => x.toLocaleString("en-US");

export function formatGammaReply(s: GammaSnapshot): string {
  const priceName = s.priceSource === "F0" ? "遠期價（查無收盤）" : "收盤";
  const flip = s.flip === null ? "flip 無" : `flip ${num(s.flip)}${s.flip_dist === null ? "" : `（距離 ${s.flip_dist}h）`}`;
  const oneDay = s.cone.find((c) => c.days === 1 && c.k === 1);

  const lines = [
    `**台指 Gamma｜${s.date}**`,
    `燈號：${s.lightLabel}（${s.action}）｜${s.regime.label}`,
    `${priceName} ${num(s.close)}｜${flip}`,
  ];
  if (s.box) {
    lines.push(
      `震盪空間：${num(s.box.lower)}（${KIND_LABEL[s.box.lowerKind] ?? s.box.lowerKind}）～ ${num(s.box.upper)}（${KIND_LABEL[s.box.upperKind] ?? s.box.upperKind}）`,
    );
  }
  if (oneDay) lines.push(`${s.nextDay} ±1σ：${num(oneDay.lower)} ～ ${num(oneDay.upper)}`);
  if (s.settlingExpiries.length > 0) lines.push(`即將結算：${s.settlingExpiries.join("、")}`);
  lines.push(DISCLAIMER);
  return lines.join("\n");
}
