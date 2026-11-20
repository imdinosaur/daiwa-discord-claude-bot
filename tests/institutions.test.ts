import assert from "node:assert/strict";
import { describe, expect, test } from "./helpers/expect.ts";
import { parseOptionInstitutionsCsv, parseSpotInstitutionsJson } from "../lib/market/institutions.ts";
import { dealerCalibration } from "../lib/gamma/calibrate.ts";
import { analyze } from "../lib/gamma/analyze.ts";
import { b76 } from "../lib/gamma/math.ts";
import { linspace } from "../lib/gamma/evaluate.ts";
import { toDayNum } from "../lib/gamma/taifex.ts";
import type { OptionRow } from "../lib/gamma/types.ts";

const CSV_HEADER =
  "日期,商品名稱,買賣權別,身份別,買方交易口數,買方交易契約金額(千元),賣方交易口數,賣方交易契約金額(千元),交易口數買賣淨額,交易契約金額買賣淨額(千元),買方未平倉口數,買方未平倉契約金額(千元),賣方未平倉口數,賣方未平倉契約金額(千元),未平倉口數買賣淨額,未平倉契約金額買賣淨額(千元)";
const csvRow = (date: string, cp: string, who: string, net: number) =>
  `${date},臺指選擇權,${cp},${who},0,0,0,0,0,0,0,0,0,0,${net},0`;

describe("parseOptionInstitutionsCsv", () => {
  const csv = [
    CSV_HEADER,
    csvRow("2026/11/19", "CALL", "自營商", 12912),
    csvRow("2026/11/20", "CALL", "自營商", 7959),
    csvRow("2026/11/20", "PUT", "自營商", 38),
    csvRow("2026/11/20", "CALL", "外資及陸資", 15155),
    csvRow("2026/11/20", "PUT", "外資及陸資", 755),
  ].join("\r\n");

  test("keeps only the requested date and maps 外資及陸資 to 外資", () => {
    expect(parseOptionInstitutionsCsv(csv, "2026-11-20")).toEqual([
      { who: "自營商", callNetOi: 7959, putNetOi: 38 },
      { who: "外資", callNetOi: 15155, putNetOi: 755 },
    ]);
  });

  test("returns an empty list when the date is missing", () => {
    expect(parseOptionInstitutionsCsv(csv, "2026-11-21")).toEqual([]);
  });

  test("throws when a required column is missing", () => {
    assert.throws(() => parseOptionInstitutionsCsv("日期,商品名稱\n2026/11/20,x", "2026-11-20"), /缺少欄位/);
  });
});

describe("parseSpotInstitutionsJson", () => {
  test("converts 元 to 億元 with two decimals", () => {
    const json = {
      stat: "OK",
      data: [
        ["自營商(避險)", "54,347,140,745", "83,363,067,613", "-29,015,926,868"],
        ["合計", "419,225,846,846", "471,471,992,442", "-52,246,145,596"],
      ],
    };
    expect(parseSpotInstitutionsJson(json)).toEqual([
      { who: "自營商(避險)", net: -290.16 },
      { who: "合計", net: -522.46 },
    ]);
  });

  test("returns an empty list when data is not published yet", () => {
    expect(parseSpotInstitutionsJson({ stat: "很抱歉，沒有符合條件的資料!" })).toEqual([]);
    expect(parseSpotInstitutionsJson(null)).toEqual([]);
  });
});

describe("dealer calibration", () => {
  const date = toDayNum("20261110");
  const exp = toDayNum("20261118");
  const T = (exp - date - 0.25) / 365;
  const rows: OptionRow[] = linspace(38000, 46000, 33).flatMap((K) =>
    (["C", "P"] as const).map((cp) => ({ date, exp, K, cp, px: b76(42000, K, T, 0.4, cp), OI: cp === "C" ? 1000 : 4000, T }))
  );

  test("weights are dealer net OI over total OI per side", () => {
    const cal = dealerCalibration(rows, [{ who: "自營商", callNetOi: 3300, putNetOi: -6600 }]);
    expect(cal?.totalCallOi).toBe(33000);
    expect(cal?.totalPutOi).toBe(132000);
    expect(cal?.weights.C).toBeCloseTo(0.1, 10);
    expect(cal?.weights.P).toBeCloseTo(-0.05, 10);
  });

  test("returns null without dealer data", () => {
    expect(dealerCalibration(rows, [{ who: "外資", callNetOi: 1, putNetOi: 1 }])).toBeNull();
  });

  test("put-heavy book is negative gamma by default but positive when dealers are long puts", () => {
    const [naive] = analyze(rows);
    expect(naive.G_after).toBeLessThan(0);
    const cal = dealerCalibration(rows, [{ who: "自營商", callNetOi: 100, putNetOi: 500 }])!;
    const [calibrated] = analyze(rows, cal.weights);
    expect(calibrated.G_after).toBeGreaterThan(0);
    expect(calibrated.flip).toBeNull();
  });
});
