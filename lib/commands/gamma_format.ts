/**
 * /gamma 的回覆格式，沿用 bots/claude-ojousama/skills/gamma_report.md 的發送格式，
 * 數字照快照 JSON，不另外推測。
 */
import type { CalibratedView, GammaSnapshot, InstitutionsView } from "../snapshot.ts";

const KIND_LABEL: Record<string, string> = { flip: "flip", callWall: "買權牆", putWall: "賣權牆" };
const DISCLAIMER = "-# 本報告為選擇權結構分析，不構成投資建議。";

const num = (x: number): string => x.toLocaleString("en-US");
const signed = (x: number): string => (x > 0 ? `+${num(x)}` : num(x));

function calibratedLine(c: CalibratedView): string {
  const flip = c.flip === null ? "flip 無" : `flip ${num(c.flip)}${c.flip_dist === null ? "" : `（距離 ${c.flip_dist}h）`}`;
  return `法人校正：${c.lightLabel}｜${c.regime.label}｜${flip}（自營商淨未平倉 買權 ${signed(c.dealerCallNetOi)}／賣權 ${signed(c.dealerPutNetOi)} 口）`;
}

/** 現貨買賣超：自營商合併自行買賣與避險，另外標出避險部分 */
function spotLine(spot: InstitutionsView["spot"]): string | null {
  const pick = (prefix: string): number | undefined => spot.find((x) => x.who.startsWith(prefix))?.net;
  const foreign = pick("外資及陸資");
  const trust = pick("投信");
  const own = pick("自營商(自行買賣)");
  const hedge = pick("自營商(避險)");
  const total = pick("合計");
  if ([foreign, trust, own, hedge, total].some((x) => x === undefined)) return null;
  const dealer = Math.round((own! + hedge!) * 100) / 100;
  return `現貨三大法人（億元）：外資 ${signed(foreign!)}｜投信 ${signed(trust!)}｜自營商 ${signed(dealer)}（避險 ${signed(hedge!)}）｜合計 ${signed(total!)}`;
}

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
  if (s.calibrated) lines.push(calibratedLine(s.calibrated));
  const spot = s.institutions ? spotLine(s.institutions.spot) : null;
  if (spot) lines.push(spot);
  lines.push(DISCLAIMER);
  return lines.join("\n");
}
