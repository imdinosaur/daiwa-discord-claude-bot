import assert from "node:assert/strict";
import { describe, expect, test } from "./helpers/expect.ts";
import { EPHEMERAL_FLAG, runDeferred, truncate, UserFacingError } from "../lib/commands/defer.ts";
import { formatGammaReply } from "../lib/commands/gamma_format.ts";
import { sanitizeNote, memoryUserName } from "../lib/commands/remember.ts";
import { CLAUDE_FM_URL, findCommand, parseEnabledCommands } from "../lib/commands/registry.ts";
import type { GammaSnapshot } from "../lib/snapshot.ts";

function fakeInteraction() {
  const calls: { method: string; arg: unknown }[] = [];
  return {
    calls,
    deferReply: async (arg: unknown) => void calls.push({ method: "deferReply", arg }),
    editReply: async (arg: unknown) => void calls.push({ method: "editReply", arg }),
  };
}

const silent = () => {};

describe("runDeferred", () => {
  test("defers before the work starts, then edits in the result", async () => {
    const i = fakeInteraction();
    let deferredWhenWorkRan = false;
    await runDeferred(i, async () => {
      deferredWhenWorkRan = i.calls.length === 1;
      return "done";
    });
    expect(deferredWhenWorkRan).toBe(true);
    expect(i.calls).toEqual([
      { method: "deferReply", arg: {} },
      { method: "editReply", arg: "done" },
    ]);
  });

  test("passes the ephemeral flag to the defer", async () => {
    const i = fakeInteraction();
    await runDeferred(i, async () => "ok", { ephemeral: true });
    expect(i.calls[0]).toEqual({ method: "deferReply", arg: { flags: EPHEMERAL_FLAG } });
  });

  test("shows a UserFacingError message as is", async () => {
    const i = fakeInteraction();
    await runDeferred(i, async () => {
      throw new UserFacingError("日期格式需為 YYYY-MM-DD");
    }, { logError: silent });
    expect(i.calls[1]).toEqual({ method: "editReply", arg: "日期格式需為 YYYY-MM-DD" });
  });

  test("hides internal error details behind a generic message", async () => {
    const i = fakeInteraction();
    let logged: unknown = null;
    await runDeferred(i, async () => {
      throw new Error("token=secret");
    }, { logError: (e) => (logged = e) });
    const reply = i.calls[1]?.arg as string;
    assert.ok(!reply.includes("secret"));
    assert.ok(logged instanceof Error);
  });

  test("times out slow work", async () => {
    const i = fakeInteraction();
    await runDeferred(i, () => new Promise<string>(() => {}), { timeoutMs: 10, logError: silent });
    assert.match(i.calls[1]?.arg as string, /逾時/);
  });
});

describe("truncate", () => {
  test("keeps short text", () => expect(truncate("abc", 10)).toBe("abc"));
  test("cuts long text to the limit", () => expect(truncate("a".repeat(30), 10)).toHaveLength(10));
});

const snap: GammaSnapshot = {
  date: "2026-11-13",
  nextDay: "2026-11-16",
  light: "green",
  lightLabel: "綠燈",
  action: "對稱",
  regime: { positive: true, label: "收盤處為正 gamma", matchesFlipLine: true },
  priceSource: "close",
  close: 43675,
  F0: 43700,
  sigma: 0.2,
  h: 1000,
  A: 1,
  G_up: 1,
  G_dn: 1,
  cliff: null,
  flip: 41834,
  flip_dist: 1.32,
  settlingExpiries: [],
  zones: [],
  callWall: 43830,
  putWall: 42833,
  box: { lower: 42833, upper: 43830, lowerKind: "putWall", upperKind: "callWall" },
  cone: [
    { days: 1, k: 1, lower: 42873, upper: 44477 },
    { days: 1, k: 2, lower: 42000, upper: 45000 },
  ],
};

describe("formatGammaReply", () => {
  const text = formatGammaReply(snap);
  test("has the title, light, and price levels", () => {
    assert.match(text, /\*\*台指 Gamma｜2026-11-13\*\*/);
    assert.match(text, /燈號：綠燈（對稱）｜收盤處為正 gamma$/m);
    assert.ok(!text.includes("收盤處為收盤處為"));
    assert.match(text, /收盤 43,675｜flip 41,834（距離 1.32h）/);
    assert.match(text, /震盪空間：42,833（賣權牆）～ 43,830（買權牆）/);
    assert.match(text, /±1σ：42,873 ～ 44,477/);
  });
  test("ends with the disclaimer", () => assert.match(text, /不構成投資建議。$/));
  test("marks a forward price used in place of the close", () => {
    assert.match(formatGammaReply({ ...snap, priceSource: "F0" }), /遠期價/);
  });
  test("handles missing flip and box", () => {
    const t = formatGammaReply({ ...snap, flip: null, flip_dist: null, box: null });
    assert.match(t, /flip 無/);
    assert.ok(!t.includes("震盪空間"));
  });
});

describe("sanitizeNote", () => {
  test("joins lines and trims", () => expect(sanitizeNote("  喜歡\n\n大和赤驥  ")).toBe("喜歡 大和赤驥"));
  test("rejects empty notes", () => assert.throws(() => sanitizeNote("  \n "), UserFacingError));
  test("rejects notes that are too long", () => assert.throws(() => sanitizeNote("a".repeat(201)), UserFacingError));
});

describe("memoryUserName", () => {
  test("lowercases a username", () => expect(memoryUserName("SiegfriedR")).toBe("siegfriedr"));
  test("rejects names with markdown characters", () => assert.throws(() => memoryUserName("a#b\nc")));
});

describe("parseEnabledCommands", () => {
  test("returns the listed known commands", () => {
    expect(parseEnabledCommands('{"commands":["gamma","remember"]}')).toEqual(["gamma", "remember"]);
  });
  test("rejects unknown names", () => assert.throws(() => parseEnabledCommands('{"commands":["nope"]}'), /nope/));
  test("rejects a malformed file", () => assert.throws(() => parseEnabledCommands('{"commands":"gamma"}')));
});

describe("/radio", () => {
  test("replies with the Claude FM link", async () => {
    const reply = await findCommand("radio")!.run({ username: "test", getString: () => null, voice: null });
    assert.ok(reply.includes(CLAUDE_FM_URL));
  });
});
