/**
 * memory/user_interactions.md 的純文字操作：在指定使用者的「互動紀錄」下插入一行。
 * 使用者區塊以完整標題 `### <username>` 比對，避免 `si` 誤中 `### siegfriedr`。
 */

const RECORD_SECTION = "- **互動紀錄**：";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 回傳使用者區塊的 [start, end)，找不到回傳 null */
function findUserBlock(content, username) {
  const heading = new RegExp(`^### ${escapeRegExp(username)}[ \\t]*$`, "m").exec(content);
  if (!heading) return null;
  const start = heading.index;
  const next = /^(### |---)/m.exec(content.slice(start + heading[0].length));
  const end = next ? start + heading[0].length + next.index : content.length;
  return { start, end };
}

/**
 * @param {string} content 記憶檔內容
 * @param {string} username
 * @param {string} entry 要插入的一行（含結尾換行）
 * @returns {{ content: string, created: boolean }}
 */
export function addNoteEntry(content, username, entry) {
  const block = findUserBlock(content, username);
  if (!block) {
    const newBlock = `\n---\n\n### ${username}\n\n- **Discord ID**：（未知）\n- **語言偏好**：待確認\n- **互動風格**：待確認\n${RECORD_SECTION}\n${entry}`;
    return { content: content + newBlock, created: true };
  }

  const sectionIdx = content.indexOf(RECORD_SECTION, block.start);
  if (sectionIdx === -1 || sectionIdx >= block.end) {
    throw new Error(`找不到 ${username} 的互動紀錄區塊`);
  }
  const lineEnd = content.indexOf("\n", sectionIdx);
  const insertAt = lineEnd === -1 ? content.length : lineEnd + 1;
  const prefix = lineEnd === -1 ? "\n" : "";
  return { content: content.slice(0, insertAt) + prefix + entry + content.slice(insertAt), created: false };
}
