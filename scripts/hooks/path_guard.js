/**
 * 專案外路徑偵測（純函式，供 outside_project_guard.js 與測試使用）
 *
 * 判斷一次工具呼叫是否碰到「允許範圍」以外的路徑。
 * 允許範圍 = 專案目錄 + 該 bot 的附件收件匣 + Claude 暫存目錄。
 * Bash / PowerShell 指令只能盡力解析：寧可多問，不可漏放。
 */

import path from "node:path";

const win = path.win32;

// 不算「路徑」的特殊裝置
const IGNORED_PATHS = new Set(["/dev/null", "nul", "$null"]);

// 工具參數中可能放路徑的欄位名稱
const PATH_KEY_RE = /path|file|dir|source|destination|cwd|root/i;

// 指令中的路徑候選
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`]*/gi;
const DRIVE_PATH_RE = /(?<![\w])[A-Za-z]:[\\/][^\s"'`|;&<>()]*/g;
const UNC_PATH_RE = /\\\\[^\s"'`|;&<>()]+/g;
const UNIX_ABS_RE = /(?<![\w:/.~$%\\-])\/[^\s"'`|;&<>()]*/g;
const HOME_REF_RE = /(^|[\s"'=(])(~(?=[\\/\s"']|$)|\$HOME\b|\$\{HOME\}|\$USERPROFILE\b|\$env:\w+|%\w+%)/gi;
const PARENT_REF_RE = /[^\s"'`|;&<>()]*\.\.(?:[\\/][^\s"'`|;&<>()]*)?/g;

const SHELL_TOOLS = new Set(["Bash", "PowerShell"]);

/** 把 Git Bash 的 /c/Users/... 轉成 C:\Users\... */
function fromGitBashPath(p) {
  const m = /^\/([A-Za-z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${(m[2] ?? "/").replace(/\//g, "\\")}` : p;
}

/** 正規化成可比較的絕對路徑（小寫、反斜線、無結尾斜線） */
export function normalizePath(p, cwd) {
  const cleaned = String(p).trim().replace(/^["']|["']$/g, "");
  const native = fromGitBashPath(cleaned);
  const resolved = win.isAbsolute(native) ? win.resolve(native) : win.resolve(cwd, native);
  return resolved.replace(/[\\/]+$/, "").toLowerCase();
}

/** p 是否位於某個允許的根目錄之內 */
export function isAllowed(p, allowedRoots, cwd) {
  if (IGNORED_PATHS.has(String(p).toLowerCase())) return true;
  const target = normalizePath(p, cwd);
  return allowedRoots.some((root) => {
    const r = normalizePath(root, cwd);
    return target === r || target.startsWith(r + "\\");
  });
}

/** 從 shell 指令中抽出所有可能指向檔案系統的字串 */
export function extractCommandPaths(command) {
  const text = String(command ?? "").replace(URL_RE, " ");
  const found = [
    ...(text.match(DRIVE_PATH_RE) ?? []),
    ...(text.match(UNC_PATH_RE) ?? []),
    ...(text.match(UNIX_ABS_RE) ?? []),
    ...(text.match(PARENT_REF_RE) ?? []),
  ];
  const homeRefs = [...text.matchAll(HOME_REF_RE)].map((m) => m[2]);
  return { paths: [...new Set(found)], homeRefs: [...new Set(homeRefs)] };
}

/** 從一般工具參數中抽出路徑欄位（含陣列） */
export function extractInputPaths(toolInput) {
  return Object.entries(toolInput ?? {})
    .filter(([key]) => PATH_KEY_RE.test(key))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((v) => typeof v === "string" && v.trim() !== "");
}

/**
 * 回傳本次工具呼叫中落在允許範圍外的項目（空陣列 = 沒問題）
 * @param {{ toolName: string, toolInput: object, cwd: string, allowedRoots: string[] }} args
 * @returns {string[]}
 */
export function findOutsideTargets({ toolName, toolInput, cwd, allowedRoots }) {
  if (SHELL_TOOLS.has(toolName)) {
    const { paths, homeRefs } = extractCommandPaths(toolInput?.command);
    const outside = paths.filter((p) => !isAllowed(p, allowedRoots, cwd));
    return [...homeRefs, ...outside];
  }
  return extractInputPaths(toolInput).filter((p) => !isAllowed(p, allowedRoots, cwd));
}
