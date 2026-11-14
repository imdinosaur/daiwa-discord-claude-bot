/**
 * 以子程序執行專案裡既有的 CLI 腳本（不經過 shell，參數不會被解讀成指令）。
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_OUTPUT_BYTES = 1024 * 1024;

export function runNodeScript(script: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(PROJECT_ROOT, script), ...args],
      { cwd: PROJECT_ROOT, timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${script} failed: ${stderr.trim() || error.message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}
