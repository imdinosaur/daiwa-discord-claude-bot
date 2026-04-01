---
name: 議會構造多 Bot 設計
description: 同時啟動兩個 Claude bot 形成議會式對話結構的可行性與困難點
type: project
---

用戶有興趣讓兩個 Claude bot 同時運行、監聽同一 Discord 頻道，形成類似議會的多 agent 對話結構。

**Why:** 探索多 agent 互動的可能性，目前先記錄困難點，未來有機會再實作。

**How to apply:** 未來討論此功能時，直接從這裡的困難點切入解決方案。

## 困難點

1. **無限迴圈風險**
   - Bot A 回應使用者 → Bot B 看到 Bot A 的訊息也回應 → Bot A 又回應 Bot B → 無限循環
   - Discord plugin 沒有內建「忽略其他 bot 訊息」的機制

2. **Bot 識別不可靠**
   - 可在 system prompt 指示「不回應其他 bot 的訊息」，但依賴 Claude 自行判斷，不穩定

3. **需要兩組 Discord Bot Token**
   - 需在 Discord Developer Portal 建立兩個獨立應用程式
   - 各自有獨立的 `.env` 設定檔

4. **缺乏協調層（Orchestrator）**
   - 現有架構沒有控制「哪個 bot 該說話、何時說話」的機制
   - 需要額外開發一個 orchestrator 來協調兩個 bot 的發言順序

## 確定的設計決定

### 對話歷史
- 兩個 bot **不共享**對話歷史（對方 bot 可能不在控制範圍內）

### 觸發規則
- 被**人類** @ → 正常回應，不計數、不限制
- 被**bot** @ → 計數器 +1，超過上限後給出總結並停止 @

### 發言順序
- 根據內容動態決定（由 Claude 在回應時判斷是否 @ 對方繼續）
- System prompt 指示：有值得反駁的論點才 @，已達共識或結論則不 @

### Bot 輪次限制實作

```js
const BOT_TURN_LIMIT = 6;
const RESET_TIMEOUT_MS = 10 * 60 * 1000; // 10 分鐘

let botTurnCount = 0;
let currentTopicId = null;
let lastBotInteractionTime = null;

function getTopicId(message) {
  if (message.channel.isThread()) {
    return message.channel.id;
  }
  const today = new Date().toISOString().slice(0, 10);
  return `${message.channel.id}-${today}`;
}

function checkAndResetCounter(topicId) {
  const now = Date.now();
  const timeoutExpired = lastBotInteractionTime &&
    (now - lastBotInteractionTime > RESET_TIMEOUT_MS);
  const topicChanged = topicId && topicId !== currentTopicId;

  if (timeoutExpired || topicChanged) {
    botTurnCount = 0;
    currentTopicId = topicId;
  }

  lastBotInteractionTime = now;
}
```

### Topic ID 規則

| 情境 | topicId | 重置時機 |
|------|---------|---------|
| Thread 內對話 | thread ID | 換 thread 或 10 分鐘無互動 |
| 一般頻道 | 頻道ID + 日期 | 隔天自動重置，或 10 分鐘無互動 |

## 解決方向

- 不需要複雜 orchestrator，用 Discord @mention 機制作為天然協調層
- Bot 之間透過 @mention 溝通，受控 bot 自行管理輪次上限
- 即使對方 bot 不配合，受控 bot 也不會無限循環
