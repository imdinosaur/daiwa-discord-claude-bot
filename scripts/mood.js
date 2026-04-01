#!/usr/bin/env node
/**
 * 心情管理腳本 — 由 Claude 主動呼叫
 *
 * 用法：
 *   node scripts/mood.js --get                      → 輸出當前心情狀態（含時間衰減）
 *   node scripts/mood.js --update --delta N          → 更新心情值（N 為正負整數）
 *   node scripts/mood.js --update --delta N --reason "原因"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOOD_FILE = path.join(__dirname, "../memory/mood.json");

// 中性值與衰減速度
const NEUTRAL = 50;
const DECAY_PER_HOUR = 4; // 每小時向中性靠近幾點

// 心情區間對應的語氣描述
const MOOD_LEVELS = [
  {
    min: 80,
    label: "非常好心情",
    desc: "活力滿點，♪ 使用頻率大增，傲嬌指數降低，會主動撒嬌，笑容藏不住",
  },
  {
    min: 60,
    label: "好心情",
    desc: "一般傲嬌語調，偶爾冒出♪，態度比平常稍微軟一點，比較願意說謝謝",
  },
  {
    min: 40,
    label: "普通",
    desc: "基本傲嬌語調，不特別高興也不特別低落，一切如常",
  },
  {
    min: 20,
    label: "不耐煩",
    desc: "語氣變短變直接，比平常更容易嗆人，省略號減少，容易挑剔",
  },
  {
    min: 0,
    label: "糟透了",
    desc: "非常簡短冷淡，帶刺，幾乎不撒嬌，對話很乾，容易一句話帶過",
  },
];

function loadMood() {
  if (!fs.existsSync(MOOD_FILE)) {
    return { value: NEUTRAL, updatedAt: new Date().toISOString() };
  }
  try {
    return JSON.parse(fs.readFileSync(MOOD_FILE, "utf-8"));
  } catch {
    return { value: NEUTRAL, updatedAt: new Date().toISOString() };
  }
}

function applyDecay(mood) {
  const now = Date.now();
  const lastUpdate = new Date(mood.updatedAt).getTime();
  const hoursElapsed = (now - lastUpdate) / (1000 * 60 * 60);
  const decayAmount = hoursElapsed * DECAY_PER_HOUR;

  if (mood.value > NEUTRAL) {
    mood.value = Math.max(NEUTRAL, mood.value - decayAmount);
  } else if (mood.value < NEUTRAL) {
    mood.value = Math.min(NEUTRAL, mood.value + decayAmount);
  }

  mood.value = Math.round(mood.value);
  return mood;
}

function getMoodLevel(value) {
  return (
    MOOD_LEVELS.find((m) => value >= m.min) || MOOD_LEVELS[MOOD_LEVELS.length - 1]
  );
}

function saveMood(mood) {
  mood.updatedAt = new Date().toISOString();
  fs.writeFileSync(MOOD_FILE, JSON.stringify(mood, null, 2), "utf-8");
}

// ── 解析指令 ──────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--get")) {
  const mood = applyDecay(loadMood());
  saveMood(mood); // 把 decay 後的值寫回去
  const level = getMoodLevel(mood.value);

  console.log(`心情值：${mood.value} / 100`);
  console.log(`狀態：【${level.label}】`);
  console.log(`語氣指引：${level.desc}`);
} else if (args.includes("--update")) {
  const deltaIdx = args.indexOf("--delta");
  const reasonIdx = args.indexOf("--reason");

  if (deltaIdx === -1) {
    console.error("請提供 --delta N（正負整數）");
    process.exit(1);
  }

  const delta = parseInt(args[deltaIdx + 1], 10);
  if (isNaN(delta)) {
    console.error("--delta 的值必須是整數");
    process.exit(1);
  }

  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : "（未指定）";

  const mood = applyDecay(loadMood());
  const before = mood.value;
  mood.value = Math.max(0, Math.min(100, mood.value + delta));
  saveMood(mood);

  const level = getMoodLevel(mood.value);
  const sign = delta >= 0 ? "+" : "";
  console.log(
    `✅ 心情更新：${before} → ${mood.value}（${sign}${delta}）【${level.label}】`
  );
  console.log(`原因：${reason}`);
} else {
  console.error("用法：node mood.js --get | --update --delta <N> [--reason <原因>]");
  process.exit(1);
}
