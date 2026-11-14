import assert from "node:assert/strict";
import { describe, test } from "./helpers/expect.ts";
import { UserFacingError } from "../lib/commands/defer.ts";
import { AutoLeaveScheduler, joinUserChannel, leaveVoice } from "../lib/commands/voice.ts";
import type { GuildVoiceContext } from "../lib/commands/voice.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("AutoLeaveScheduler", () => {
  test("leaves after the delay when nobody is left", async () => {
    const left: string[] = [];
    const s = new AutoLeaveScheduler((g) => left.push(g), 10);
    s.update("g1", 0);
    assert.equal(s.isPending("g1"), true);
    await wait(30);
    assert.deepEqual(left, ["g1"]);
    assert.equal(s.isPending("g1"), false);
  });

  test("cancels when someone comes back", async () => {
    const left: string[] = [];
    const s = new AutoLeaveScheduler((g) => left.push(g), 10);
    s.update("g1", 0);
    s.update("g1", 1);
    await wait(30);
    assert.deepEqual(left, []);
  });

  test("does not restart the timer on repeated empty updates", async () => {
    const left: string[] = [];
    const s = new AutoLeaveScheduler((g) => left.push(g), 20);
    s.update("g1", 0);
    await wait(12);
    s.update("g1", 0);
    await wait(15);
    assert.deepEqual(left, ["g1"]);
  });

  test("keeps guilds separate", async () => {
    const left: string[] = [];
    const s = new AutoLeaveScheduler((g) => left.push(g), 10);
    s.update("g1", 0);
    s.update("g2", 2);
    await wait(30);
    assert.deepEqual(left, ["g1"]);
  });
});

describe("joinUserChannel input checks", () => {
  const base = { guildId: "g", adapterCreator: (() => ({})) as unknown as GuildVoiceContext["adapterCreator"] };

  test("asks the user to join a voice channel first", async () => {
    await assert.rejects(joinUserChannel({ ...base, userChannel: null }), UserFacingError);
  });

  test("reports a channel the bot cannot join", async () => {
    await assert.rejects(
      joinUserChannel({ ...base, userChannel: { id: "c", name: "閒聊", joinable: false } }),
      (e: unknown) => e instanceof UserFacingError && e.message.includes("閒聊"),
    );
  });
});

describe("leaveVoice", () => {
  test("says so when not connected", () => {
    assert.throws(() => leaveVoice("no-such-guild"), UserFacingError);
  });
});
