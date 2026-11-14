/**
 * /remember 的輸入檢查：筆記會寫進 memory/user_interactions.md 的一行，
 * 所以要壓成單行、限制長度，使用者名稱只允許 Discord 使用者名稱的字元。
 */
import { UserFacingError } from "./defer.ts";

export const MAX_NOTE_LENGTH = 200;
const USERNAME_PATTERN = /^[a-z0-9_.]{2,32}$/;

export function sanitizeNote(raw: string): string {
  const note = raw.replace(/\s+/g, " ").trim();
  if (note.length === 0) throw new UserFacingError("要記住的內容是空的。");
  if (note.length > MAX_NOTE_LENGTH) throw new UserFacingError(`內容太長了，請在 ${MAX_NOTE_LENGTH} 字以內。`);
  return note;
}

export function memoryUserName(username: string): string {
  const name = username.toLowerCase();
  if (!USERNAME_PATTERN.test(name)) throw new Error(`unexpected Discord username: ${JSON.stringify(username)}`);
  return name;
}
