# 設定指南

## 前置需求

- [Claude Code](https://claude.ai/code) CLI 已安裝並登入
- Node.js 18 以上（或 [Bun](https://bun.sh)）
- Discord 伺服器管理員權限

---

## 步驟 1：安裝 Discord Plugin

在 Claude Code 中執行：

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install discord@claude-plugins-official
```

---

## 步驟 2：設定 Discord Bot Token

在 Claude Code 中執行：

```
/discord:configure
```

依照提示貼上 Bot Token。

Token 會儲存在：

```
~/.claude/channels/discord/.env
```

> **如何取得 Bot Token：**
> 前往 [Discord Developer Portal](https://discord.com/developers/applications) → 選擇（或建立）應用程式 → Bot → Reset Token

---

## 步驟 3：建立專案 `.env` 檔

複製範本並填入值：

```bash
cp .env.example .env
```

然後編輯 `.env`，填入以下資訊：

| 變數 | 說明 | 哪裡取得 |
|------|------|----------|
| `DISCORD_ADMIN_USER_ID` | 你的 Discord 使用者 ID | Discord → 設定 → 進階 → 開發者模式開啟後，對自己右鍵 → 複製使用者 ID |
| `DISCORD_CHANNEL_ID` | 預設發送頻道的 ID | 對頻道右鍵 → 複製頻道 ID |
| `DISCORD_STARTUP_CHANNEL_ID` | 啟動通知頻道的 ID | 同上 |
| `DISCORD_WEBHOOK_URL` | Webhook URL | Discord 伺服器設定 → 整合 → Webhook → 建立後複製 URL |
| `ANTHROPIC_API_KEY` | Anthropic API 金鑰（非必填） | [console.anthropic.com](https://console.anthropic.com/settings/keys) |

---

## 步驟 4：建立頻道對應表

複製範本：

```bash
cp config/channels.example.json config/channels.json
```

然後編輯 `config/channels.json`，填入你的頻道 ID：

```json
{
  "broadcast": {
    "頻道名稱": "頻道ID"
  },
  "broadcastDm": {
    "使用者名稱": "使用者ID"
  },
  "channels": {
    "default": "預設頻道ID",
    "頻道名稱": "頻道ID"
  }
}
```

| 區塊 | 用途 |
|------|------|
| `broadcast` | `--broadcast` 廣播時發送的目標頻道（例如啟動通知） |
| `broadcastDm` | `--broadcast` 廣播時另外私訊的使用者。**填 user ID，不要填 DM 頻道 ID**：DM 頻道只屬於單一 bot，換成其他 bot 發送會得到 403 Missing Access |
| `channels` | 一般主動推播時的目標頻道，`default` 為未指定時的備援 |

頻道 ID 取得方式：Discord 開發者模式開啟後，對頻道右鍵 → 複製頻道 ID；使用者 ID 則是對使用者右鍵 → 複製使用者 ID。

> `config/channels.json` 已列入 `.gitignore`，不會被提交到 git。

---

## 步驟 5：啟動

```bash
npm start
```

或指定 Bot 角色啟動（Windows）：

```powershell
npm run start:daiwa
```

---

## 檔案總覽

```
~/.claude/channels/discord/.env   ← Bot Token（由 /discord:configure 自動建立）
.env                               ← Webhook URL、頻道 ID 等（手動建立，勿上傳 git）
config/channels.json               ← 頻道對應表（手動建立，勿上傳 git）
config/channels.example.json      ← 範本（已納入 git，供參考）
```

> `.env` 與 `config/channels.json` 已列入 `.gitignore`，不會被提交到 git。
