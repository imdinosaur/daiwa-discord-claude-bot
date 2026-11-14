import assert from "node:assert/strict";
import { describe, test } from "./helpers/expect.ts";
import { addNoteEntry } from "../lib/memory_file.js";

const file = [
  "# 互動記憶",
  "",
  "### siegfriedr",
  "",
  "- **互動紀錄**：",
  "  - 2026-01-01：舊紀錄",
  "",
  "---",
  "",
  "### si",
  "",
  "- **互動紀錄**：",
  "  - 2026-01-02：si 的紀錄",
  "",
].join("\n");

const entry = "  - 2026-11-14：新筆記\n";

describe("addNoteEntry", () => {
  test("writes into the exact user's block, not a user whose name starts the same", () => {
    const { content, created } = addNoteEntry(file, "si", entry);
    assert.equal(created, false);
    const siBlock = content.slice(content.indexOf("### si\n"));
    assert.ok(siBlock.includes(entry));
    assert.ok(!content.slice(0, content.indexOf("### si\n")).includes("新筆記"));
  });

  test("puts the newest entry first in the record list", () => {
    const { content } = addNoteEntry(file, "siegfriedr", entry);
    assert.ok(content.includes(`- **互動紀錄**：\n${entry}  - 2026-01-01：舊紀錄`));
  });

  test("creates a new block when only a longer name exists", () => {
    const { content, created } = addNoteEntry(file, "siegfried", entry);
    assert.equal(created, true);
    assert.ok(content.endsWith(`### siegfried\n\n- **Discord ID**：（未知）\n- **語言偏好**：待確認\n- **互動風格**：待確認\n- **互動紀錄**：\n${entry}`));
  });

  test("does not borrow the record section of the next user", () => {
    const broken = "### alice\n\n- note\n\n---\n\n### bob\n\n- **互動紀錄**：\n";
    assert.throws(() => addNoteEntry(broken, "alice", entry), /alice/);
  });
});
