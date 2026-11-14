#!/usr/bin/env node
/**
 * 記憶儲存腳本 — 由 Claude 主動呼叫
 * 用法：node scripts/save_memory.js --user <username> --note "<摘要>"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { addNoteEntry } from "../lib/memory_file.js";

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

  const today = getTodayDate();
  const entry = `  - ${today}：${note}\n`;
  let result;
  try {
    result = addNoteEntry(fs.readFileSync(MEMORY_FILE, "utf-8"), username, entry);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  fs.writeFileSync(MEMORY_FILE, result.content, "utf-8");
  console.log(result.created ? `✅ 新增使用者 ${username} 並記錄` : `✅ 已記錄 ${username} 的對話摘要（${today}）`);
}

const { user, note } = parseArgs();

if (!user || !note) {
  console.error("用法：node save_memory.js --user <username> --note \"<摘要>\"");
  process.exit(1);
}

saveNote(user, note);
