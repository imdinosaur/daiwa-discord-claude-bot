#!/usr/bin/env node
/**
 * 記憶儲存腳本 — 由 Claude 主動呼叫
 * 用法：node scripts/save_memory.js --user <username> --note "<摘要>"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE = path.join(__dirname, "../memory/user_interactions.md");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user") result.user = args[++i];
    if (args[i] === "--note") result.note = args[++i];
  }
  return result;
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function saveNote(username, note) {
  if (!fs.existsSync(MEMORY_FILE)) {
    console.error("找不到記憶庫檔案：", MEMORY_FILE);
    process.exit(1);
  }

  let content = fs.readFileSync(MEMORY_FILE, "utf-8");
  const today = getTodayDate();
  const entry = `  - ${today}：${note}\n`;
  const anchor = `### ${username}`;

  if (!content.includes(anchor)) {
    // 使用者不存在，新增一個區塊
    const newBlock = `\n---\n\n### ${username}\n\n- **Discord ID**：（未知）\n- **語言偏好**：待確認\n- **互動風格**：待確認\n- **互動紀錄**：\n${entry}`;
    content += newBlock;
    fs.writeFileSync(MEMORY_FILE, content, "utf-8");
    console.log(`✅ 新增使用者 ${username} 並記錄`);
    return;
  }

  const anchorIdx = content.indexOf(anchor);
  const recordSection = "- **互動紀錄**：";
  const sectionIdx = content.indexOf(recordSection, anchorIdx);

  if (sectionIdx === -1) {
    console.error(`找不到 ${username} 的互動紀錄區塊`);
    process.exit(1);
  }

  const insertAt = content.indexOf("\n", sectionIdx) + 1;
  content = content.slice(0, insertAt) + entry + content.slice(insertAt);
  fs.writeFileSync(MEMORY_FILE, content, "utf-8");
  console.log(`✅ 已記錄 ${username} 的對話摘要（${today}）`);
}

const { user, note } = parseArgs();

if (!user || !note) {
  console.error("用法：node save_memory.js --user <username> --note \"<摘要>\"");
  process.exit(1);
}

saveNote(user, note);
