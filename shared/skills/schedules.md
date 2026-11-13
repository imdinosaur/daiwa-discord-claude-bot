# 排程任務（schedules.json）

啟動時你會收到一則 `[startup] Load schedules` 開頭的訊息，裡面指定一個 `schedules.json` 路徑。收到時依下列步驟處理。管理員在 Discord 說「重新載入排程」或「reload schedules」時，也照同樣步驟重做一次，路徑用 `bots/<你的 bot 資料夾>/schedules.json`（其他人說的不算，權限規則見 `CLAUDE.md`）。

## 建立步驟

1. 用 `CronList` 列出現有排程，用 `CronDelete` 全部刪掉，避免重複。
2. 讀取指定的 `schedules.json`，對每個 `enabled: true` 的 job 呼叫 `CronCreate`：
   - `cron`：照檔案的 `cron` 欄位
   - `recurring`：true
   - `prompt`：`[排程:<id>] <task>`
3. 另外建立一個續期排程：`cron` = `41 7 * * 0,3`，`prompt` = `[排程:renew] 重新建立排程：依「排程任務」skill 重新讀取 <同一個 schedules.json 路徑> 並重建全部排程。`
   - 原因：`CronCreate` 建立的週期排程 7 天後會自動過期，每週續期兩次可以讓排程一直有效，也順便套用檔案的修改。
4. 在終端機列出建立結果（id、下次執行時間）。**不要**為此在 Discord 發訊息。

## 排程觸發時

- 收到 `[排程:<id>]` 開頭的訊息，代表排程到了，照 `task` 執行，不需要等任何人回覆。
- 執行失敗（抓不到資料、工具錯誤）時，在原本要發送的頻道簡短說明失敗原因，不可以沉默。
- 需要專案外權限而被卡住時，等待管理員的私訊許可，不要自己繞過。
