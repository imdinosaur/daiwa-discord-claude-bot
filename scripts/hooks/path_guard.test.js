import { test } from "node:test";
import assert from "node:assert/strict";
import { findOutsideTargets, isAllowed } from "./path_guard.js";

const PROJECT = "F:\\Users\\SiegfriedR\\Documents\\github\\claude-bot";
const INBOX = "C:\\Users\\SiegfriedR\\.claude\\channels\\discord\\inbox";
const ROOTS = [PROJECT, INBOX];

const check = (toolName, toolInput) =>
  findOutsideTargets({ toolName, toolInput, cwd: PROJECT, allowedRoots: ROOTS });

test("allows files inside the project, case-insensitively", () => {
  assert.deepEqual(check("Read", { file_path: `${PROJECT}\\CLAUDE.md` }), []);
  assert.equal(isAllowed("f:/users/siegfriedr/documents/github/claude-bot/x", ROOTS, PROJECT), true);
});

test("allows relative paths that stay inside the project", () => {
  assert.deepEqual(check("Edit", { file_path: "scripts/../config/channels.json" }), []);
});

test("does not treat a sibling folder with a shared prefix as inside", () => {
  assert.equal(check("Read", { file_path: `${PROJECT}-old\\a.txt` }).length, 1);
});

test("allows the bot's attachment inbox", () => {
  assert.deepEqual(check("Read", { file_path: `${INBOX}\\1792680419152-1.png` }), []);
});

test("flags reading another bot's channel state", () => {
  const out = check("Read", { file_path: "C:\\Users\\SiegfriedR\\.claude\\channels\\discord\\access.json" });
  assert.equal(out.length, 1);
});

test("flags Discord reply attachments outside the project", () => {
  const out = check("mcp__plugin_discord_discord__reply", { chat_id: "1", text: "hi", files: ["C:\\Windows\\win.ini"] });
  assert.deepEqual(out, ["C:\\Windows\\win.ini"]);
});

test("flags Glob/Grep searches rooted outside the project", () => {
  assert.equal(check("Grep", { pattern: "token", path: "C:\\Users\\SiegfriedR" }).length, 1);
});

test("flags shell commands with outside absolute paths in any style", () => {
  assert.equal(check("Bash", { command: "cat C:/Users/SiegfriedR/.ssh/id_rsa" }).length, 1);
  assert.equal(check("Bash", { command: "ls /c/Users/SiegfriedR" }).length, 1);
  assert.equal(check("PowerShell", { command: "Get-Content \\\\server\\share\\x" }).length, 1);
});

test("flags shell commands that reference home or env-var paths", () => {
  assert.equal(check("Bash", { command: "cat ~/.claude/settings.json" }).length, 1);
  assert.equal(check("PowerShell", { command: "ls $env:USERPROFILE" }).length, 1);
  assert.equal(check("Bash", { command: "type %APPDATA%\\x" }).length, 1);
});

test("flags shell commands escaping the project with ..", () => {
  assert.equal(check("Bash", { command: "cat ../other-repo/.env" }).length, 1);
});

test("allows the project's own scripts and URLs", () => {
  const cmd = `node "${PROJECT}\\scripts\\save_memory.js" --user a --note "b"`;
  assert.deepEqual(check("Bash", { command: cmd }), []);
  assert.deepEqual(check("Bash", { command: "node scripts/push_message.js --channel x 2>/dev/null" }), []);
  assert.deepEqual(check("Bash", { command: "curl -s https://www.jra.go.jp/keiba/ -o page.html" }), []);
});

test("ignores tools without path arguments", () => {
  assert.deepEqual(check("WebSearch", { query: "JRA G1" }), []);
});
