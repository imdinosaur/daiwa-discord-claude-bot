# Claude Bot — ダイワスカーレット Discord Bot

基於 [Claude Code](https://claude.ai/code) 與 Discord Plugin 驅動的角色扮演 Bot，以《賽馬娘 Pretty Derby》中的**大和赤驥（ダイワスカーレット）**為預設角色，可傲嬌地回應 Discord 訊息。

---

## 功能

- **角色扮演**：完整的大和赤驥性格設定，含傲嬌語調、心情系統、季節性台詞
- **心情系統**：心情值（0–100）隨時間衰減並依對話事件增減，自動反映在語調上
- **主動推播**：透過 Webhook 或 Bot Token 向指定頻道或使用者 DM 發送訊息
- **記憶系統**：記錄各使用者的互動偏好與重要資訊，跨 session 保持連貫
- **JRA 賽程查詢**：可查詢日本中央賽馬會當週 G1 賽事資訊

---

## 技術架構

```
Claude Code CLI
  └─ Discord Plugin (claude-plugins-official)
       └─ 接收 Discord 訊息 → 傳給 Claude → 回覆
```

- **Runtime**：Claude Code CLI + Node.js
- **角色設定**：`bots/daiwa-scarlet/character.md`
- **主動推播**：`scripts/push_message.js`（支援 Webhook / Bot Token / DM）
- **心情管理**：`scripts/mood.js`（持久化至 `memory/mood.json`）

---

## 設定與啟動

詳細步驟請參閱 [SETUP.md](SETUP.md)。

**快速概覽：**

1. 安裝 Claude Code 並登入
2. 安裝 Discord Plugin：在 Claude Code 中執行 `/plugin install discord@claude-plugins-official`
3. 設定 Bot Token：執行 `/discord:configure`
4. 複製並填寫 `.env.example` → `.env`
5. 複製並填寫 `config/channels.example.json` → `config/channels.json`
6. 執行 `npm start`

---

## 資料夾結構

```
claude-bot/
├── bots/
│   └── daiwa-scarlet/
│       ├── character.md        # 角色性格與說話方式設定
│       ├── skills/             # 技能擴充（JRA 查詢、排程等）
│       └── startup_message.txt # 啟動時發送的訊息
├── config/
│   └── channels.example.json  # 頻道對應表範本
├── memory/
│   ├── MEMORY.md               # Bot 行為偏好索引
│   └── mood.json               # 心情狀態（本機，不上傳 git）
├── scripts/
│   ├── mood.js                 # 心情讀取／更新
│   ├── push_message.js         # 主動推播
│   └── save_memory.js          # 記憶儲存
├── .env.example                # 環境變數範本
├── SETUP.md                    # 詳細設定指南
└── CLAUDE.md                   # Claude Code 行為設定
```

---

## 需自行建立的檔案（不納入 git）

| 檔案 | 說明 |
|------|------|
| `.env` | Webhook URL、頻道 ID、API Key |
| `config/channels.json` | 廣播與推播頻道對應表 |
| `memory/mood.json` | Bot 心情狀態（自動生成） |
| `~/.claude/channels/discord/.env` | Discord Bot Token（由 `/discord:configure` 自動建立） |
