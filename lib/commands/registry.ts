/**
 * Slash command 定義。每個 bot 在 bots/<bot>/commands.json 列出要啟用哪些指令。
 * 這些指令不經過 Claude，直接呼叫專案裡既有的腳本，所以回應快、不佔用 Claude session。
 */
import { UserFacingError } from "./defer.ts";
import { formatGammaReply } from "./gamma_format.ts";
import { memoryUserName, sanitizeNote } from "./remember.ts";
import { runNodeScript } from "./run_script.ts";
import { joinUserChannel, leaveVoice } from "./voice.ts";
import type { GuildVoiceContext } from "./voice.ts";
import type { GammaSnapshot } from "../snapshot.ts";

const GUILD_CONTEXT = 0; // InteractionContextType.Guild：只能在伺服器裡使用

const STRING_OPTION = 3; // ApplicationCommandOptionType.String
const GAMMA_TIMEOUT_MS = 90_000;
const QUICK_SCRIPT_TIMEOUT_MS = 15_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CommandContext {
  username: string;
  getString(name: string): string | null;
  /** 在伺服器裡下指令時才有；DM 中為 null */
  voice: GuildVoiceContext | null;
}

export interface OptionSpec {
  type: number;
  name: string;
  description: string;
  required: boolean;
  max_length?: number;
}

export interface CommandSpec {
  name: string;
  description: string;
  options: OptionSpec[];
  /** 只有管理員能用；其他人會收到只有自己看得到的拒絕訊息 */
  adminOnly: boolean;
  /** 回覆只有觸發者看得到 */
  ephemeral: boolean;
  /** 只在伺服器裡註冊（DM 裡看不到） */
  guildOnly?: boolean;
  run(ctx: CommandContext): Promise<string>;
}

// 同一個日期同時有人查時共用同一次執行，避免公開指令被連按開出一堆子程序
const gammaInFlight = new Map<string, Promise<string>>();

function fetchGamma(date: string | null): Promise<string> {
  const key = date ?? "latest";
  const existing = gammaInFlight.get(key);
  if (existing) return existing;
  const run = runNodeScript("scripts/gamma_today.ts", date === null ? [] : [date], GAMMA_TIMEOUT_MS)
    .then((stdout) => formatGammaReply(JSON.parse(stdout) as GammaSnapshot))
    .finally(() => gammaInFlight.delete(key));
  gammaInFlight.set(key, run);
  return run;
}

async function runGamma(ctx: CommandContext): Promise<string> {
  const date = ctx.getString("date");
  if (date !== null && !DATE_PATTERN.test(date)) throw new UserFacingError("日期格式需為 YYYY-MM-DD。");
  return fetchGamma(date);
}

async function runRemember(ctx: CommandContext): Promise<string> {
  const note = sanitizeNote(ctx.getString("note") ?? "");
  const user = memoryUserName(ctx.username);
  await runNodeScript("scripts/save_memory.js", ["--user", user, "--note", note], QUICK_SCRIPT_TIMEOUT_MS);
  return `已記住：${note}`;
}

async function runMood(): Promise<string> {
  return runNodeScript("scripts/mood.js", ["--get"], QUICK_SCRIPT_TIMEOUT_MS);
}

// Anthropic 官方短網址，會轉到目前的 YouTube 直播；只給連結，不轉播音訊
export const CLAUDE_FM_URL = "https://clau.de/radio";

async function runRadio(): Promise<string> {
  return `Claude FM（Anthropic 的 24 小時 lo-fi 直播）：${CLAUDE_FM_URL}`;
}

const GUILD_ONLY_REPLY = "這個指令只能在伺服器裡用。";

async function runJoin(ctx: CommandContext): Promise<string> {
  if (!ctx.voice) throw new UserFacingError(GUILD_ONLY_REPLY);
  return joinUserChannel(ctx.voice);
}

async function runLeave(ctx: CommandContext): Promise<string> {
  if (!ctx.voice) throw new UserFacingError(GUILD_ONLY_REPLY);
  return leaveVoice(ctx.voice.guildId);
}

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: "gamma",
    description: "台指選擇權 gamma 快照（預設最近一個交易日）",
    options: [{ type: STRING_OPTION, name: "date", description: "日期 YYYY-MM-DD", required: false, max_length: 10 }],
    adminOnly: false,
    ephemeral: false,
    run: runGamma,
  },
  {
    name: "remember",
    description: "請 bot 記住一件關於你的事",
    options: [{ type: STRING_OPTION, name: "note", description: "要記住的內容", required: true, max_length: 200 }],
    adminOnly: false,
    ephemeral: true,
    run: runRemember,
  },
  {
    // CLAUDE.md：心情值不告訴一般使用者，所以限管理員、只有自己看得到
    name: "mood",
    description: "查看目前心情值（管理員）",
    options: [],
    adminOnly: true,
    ephemeral: true,
    run: runMood,
  },
  {
    name: "join",
    description: "讓 bot 加入你目前所在的語音頻道",
    options: [],
    adminOnly: false,
    ephemeral: false,
    guildOnly: true,
    run: runJoin,
  },
  {
    name: "leave",
    description: "讓 bot 離開語音頻道",
    options: [],
    adminOnly: false,
    ephemeral: false,
    guildOnly: true,
    run: runLeave,
  },
  {
    name: "radio",
    description: "取得 Claude FM 直播連結",
    options: [],
    adminOnly: false,
    ephemeral: false,
    run: runRadio,
  },
];

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name);
}

/** 解析 bots/<bot>/commands.json：{"commands": ["gamma", ...]} */
export function parseEnabledCommands(json: string): string[] {
  const data: unknown = JSON.parse(json);
  const list = (data as { commands?: unknown } | null)?.commands;
  if (!Array.isArray(list) || !list.every((n) => typeof n === "string")) {
    throw new Error('commands.json must look like {"commands": ["gamma"]}');
  }
  const unknown = list.filter((n) => !findCommand(n));
  if (unknown.length > 0) throw new Error(`unknown commands in commands.json: ${unknown.join(", ")}`);
  return list;
}

/** 註冊到 Discord 用的 JSON */
export function toRegistrationBody(names: readonly string[]): object[] {
  return names.map((name) => {
    const c = findCommand(name)!;
    const base = { name: c.name, description: c.description, options: c.options };
    return c.guildOnly ? { ...base, contexts: [GUILD_CONTEXT] } : base;
  });
}
