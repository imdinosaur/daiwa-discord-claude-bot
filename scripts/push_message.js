#!/usr/bin/env node
/**
 * 主動推播腳本 — 由 Claude 或外部排程器呼叫
 *
 * 用法：
 *   node scripts/push_message.js --channel "訊息內容"
 *       → 透過 Webhook 發送到預設頻道
 *
 *   node scripts/push_message.js --channel "訊息內容" --channel-id "頻道ID"
 *       → 透過 Bot Token 發送到指定頻道
 *
 *   node scripts/push_message.js --dm "訊息內容"
 *       → 透過 Bot Token 傳送 DM 給管理員（DISCORD_ADMIN_USER_ID）
 *
 *   node scripts/push_message.js --dm "訊息內容" --user-id "使用者ID"
 *       → 透過 Bot Token 傳送 DM 給指定使用者
 *
 * 選用參數：
 *   --username "顯示名稱"   Webhook 顯示名稱（僅 --channel 模式有效）
 *   --avatar   "URL"        Webhook 頭像（僅 --channel 模式有效）
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const CHANNELS_FILE = path.join(PROJECT_ROOT, "config/channels.json");

function loadChannels(group = "channels") {
  if (!fs.existsSync(CHANNELS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CHANNELS_FILE, "utf-8"))[group] ?? {};
  } catch {
    return {};
  }
}

// ── 讀取 .env 檔案 ──────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// 載入順序同 start.ps1：plugin env → project env
loadEnvFile(path.join(os.homedir(), ".claude/channels/discord/.env"));
loadEnvFile(path.join(PROJECT_ROOT, ".env"));

// ── Discord API 呼叫 ─────────────────────────────────────────
async function discordRequest(endpoint, body, token) {
  const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord API 錯誤 ${res.status}: ${err}`);
  }
  return res.json();
}

// ── 透過 Webhook 發送到頻道 ──────────────────────────────────
async function sendViaWebhook(content, username, avatarUrl) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("DISCORD_WEBHOOK_URL 未設定");

  const body = { content };
  if (username) body.username = username;
  if (avatarUrl) body.avatar_url = avatarUrl;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Webhook 錯誤 ${res.status}: ${err}`);
  }
  // 204 No Content 時不解析 body
  return res.status === 204 ? null : await res.json();
}

// ── 透過 Bot Token 發送到指定頻道 ────────────────────────────
async function sendToChannel(content, channelId) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN 未設定（請先執行 /discord:configure）");
  if (!channelId) throw new Error("需要提供 --channel-id 或設定 DISCORD_CHANNEL_ID");

  return discordRequest(`/channels/${channelId}/messages`, { content }, token);
}

// ── 透過 Bot Token 發送 DM ───────────────────────────────────
async function sendDM(content, userId) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN 未設定（請先執行 /discord:configure）");
  if (!userId) throw new Error("需要提供 --user-id 或設定 DISCORD_ADMIN_USER_ID");

  // Step 1：建立 DM 頻道
  const dmChannel = await discordRequest("/users/@me/channels", { recipient_id: userId }, token);

  // Step 2：發送訊息
  return discordRequest(`/channels/${dmChannel.id}/messages`, { content }, token);
}

// ── 解析參數 ─────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const channelMsg = getArg("--channel");
const dmMsg = getArg("--dm");
const toName = getArg("--to");
const broadcast = args.includes("--broadcast");
const channels = loadChannels("channels");
const channelId = getArg("--channel-id") || (toName && channels[toName]) || process.env.DISCORD_CHANNEL_ID;
const userId = getArg("--user-id") || process.env.DISCORD_ADMIN_USER_ID;
const username = getArg("--username");
const avatarUrl = getArg("--avatar");

if (!channelMsg && !dmMsg) {
  console.error("用法：");
  console.error('  node scripts/push_message.js --channel "訊息"');
  console.error('  node scripts/push_message.js --channel "訊息" --to "頻道名稱"');
  console.error('  node scripts/push_message.js --channel "訊息" --channel-id "頻道ID"');
  console.error('  node scripts/push_message.js --dm "訊息"');
  console.error('  node scripts/push_message.js --dm "訊息" --user-id "使用者ID"');
  console.error("");
  console.error("可用頻道（channels）：");
  const ch = loadChannels("channels");
  if (Object.keys(ch).length === 0) {
    console.error("  （尚未設定）");
  } else {
    for (const [name, id] of Object.entries(ch)) console.error(`  ${name} → ${id}`);
  }
  console.error("廣播頻道（broadcast）：");
  const bc = loadChannels("broadcast");
  if (Object.keys(bc).length === 0) {
    console.error("  （尚未設定）");
  } else {
    for (const [name, id] of Object.entries(bc)) console.error(`  ${name} → ${id}`);
  }
  process.exit(1);
}

try {
  if (channelMsg) {
    if (broadcast) {
      // 廣播到 broadcast 群組的所有頻道
      const broadcastChannels = loadChannels("broadcast");
      const entries = Object.entries(broadcastChannels);
      if (entries.length === 0) {
        console.error("❌ channels.json 的 broadcast 群組中沒有任何頻道");
        process.exit(1);
      }
      for (const [name, id] of entries) {
        try {
          await sendToChannel(channelMsg, id);
          console.log(`✅ 已發送到 ${name} (${id})`);
        } catch (err) {
          console.error(`❌ 發送到 ${name} (${id}) 失敗：${err.message}`);
        }
      }
    } else if (toName || args.includes("--channel-id")) {
      // 指定單一頻道 → Bot Token
      if (!channelId) {
        console.error(`❌ 找不到頻道「${toName}」，請先在 config/channels.json 中新增`);
        process.exit(1);
      }
      await sendToChannel(channelMsg, channelId);
      const label = toName ? `${toName} (${channelId})` : channelId;
      console.log(`✅ 已透過 Bot Token 發送到頻道 ${label}`);
    } else {
      // 預設 → Webhook
      await sendViaWebhook(channelMsg, username, avatarUrl);
      console.log("✅ 已透過 Webhook 發送到頻道");
    }
  }

  if (dmMsg) {
    await sendDM(dmMsg, userId);
    console.log(`✅ 已透過 Bot Token 發送 DM 給使用者 ${userId}`);
  }
} catch (err) {
  console.error(`❌ 發送失敗：${err.message}`);
  process.exit(1);
}
