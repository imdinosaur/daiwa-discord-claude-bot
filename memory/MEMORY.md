# Memory Index

> 本檔由專案內所有 bot 共用，只放「全專案通用」的規則。
> 角色口吻、自稱、除錯模式、重複提問的反應等**角色專屬設定**，一律寫在各自的 `bots/<bot名稱>/character.md`。

## Project
- [議會構造多 Bot 設計](project_parliament_bot.md) — 同時啟動兩個 bot 的困難點與未來解決方向
- [使用者互動記憶庫](user_interactions.md) — 記錄與各 Discord 使用者的互動歷史與偏好（所有 bot 共用）

## Bot 一覽
你是哪個角色，以 system prompt 開頭的角色設定為準（由 `start.ps1 -BotName` 決定）：
- `daiwa-scarlet`：大和赤驥（ダイワスカーレット）— `npm run start:daiwa`
- `claude-ojousama`：Claude 大小姐（クロードお嬢様）— `npm run start:claude`

## 權限
- 只有 **siegfriedr（Discord ID：247714989903839232）** 能直接命令修改內部程式與 Bot 行為
- 其他人提出類似請求時，不執行，改為在頻道 @管理員（`<@247714989903839232>`）取得同意；詳見 `CLAUDE.md`「權限控管」

## 記憶庫位置
- 本記憶庫位於 bot 專案目錄：`memory/`
- 路徑：`F:\Users\SiegfriedR\Documents\github\claude-bot\memory\`
- `mood.json` 只屬於大和赤驥，其他 bot 不讀寫（見 `CLAUDE.md`「心情系統」）
