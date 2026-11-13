#!/usr/bin/env node
/**
 * PreToolUse hook：bot 要碰專案以外的路徑時，改成「需要許可」。
 *
 * 許可請求會經由 Discord 插件的 permission relay 私訊給 access.json 的
 * allowFrom（目前只有管理員），由管理員按 Allow / Deny 決定。
 *
 * 只在 bot session 生效（start.ps1 會設定 CLAUDE_BOT_NAME）；
 * 一般開發用的 Claude Code session 不受影響。
 */

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOutsideTargets } from "./path_guard.js";

const MAX_LISTED_TARGETS = 5;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, "..", "..");

// 與 Discord 插件相同的規則：附件下載到 <STATE_DIR>/inbox
const STATE_DIR = process.env.DISCORD_STATE_DIR || path.join(os.homedir(), ".claude", "channels", "discord");

const ALLOWED_ROOTS = [
  PROJECT_ROOT,
  path.join(STATE_DIR, "inbox"),
  path.join(os.tmpdir(), "claude"),
];

function respond(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  if (!process.env.CLAUDE_BOT_NAME) return; // 非 bot session：不介入

  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch (err) {
    // 解析失敗時寧可詢問，也不默默放行
    respond("ask", `專案外存取檢查無法解析工具輸入（${err.message}），需要管理員確認。`);
    return;
  }

  const outside = findOutsideTargets({
    toolName: input.tool_name,
    toolInput: input.tool_input,
    cwd: input.cwd || PROJECT_ROOT,
    allowedRoots: ALLOWED_ROOTS,
  });
  if (outside.length === 0) return; // 交回一般權限流程

  const listed = outside.slice(0, MAX_LISTED_TARGETS).join(", ");
  const more = outside.length > MAX_LISTED_TARGETS ? ` 等 ${outside.length} 項` : "";
  respond("ask", `[${process.env.CLAUDE_BOT_NAME}] 要存取專案以外的位置：${listed}${more}。需要管理員同意。`);
}

main().catch((err) => {
  respond("ask", `專案外存取檢查發生錯誤（${err.message}），需要管理員確認。`);
});
