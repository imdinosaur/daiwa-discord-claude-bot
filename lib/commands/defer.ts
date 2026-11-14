/**
 * Slash command 的 defer 流程：Discord 要求 3 秒內回應，
 * 所以先 deferReply（使用者看到「思考中…」），做完再 editReply。
 * interaction token 15 分鐘後失效，工作時間上限要比它短。
 */

export const EPHEMERAL_FLAG = 64; // MessageFlags.Ephemeral：只有觸發者看得到
export const DISCORD_MESSAGE_LIMIT = 2000;
export const DEFAULT_WORK_TIMEOUT_MS = 10 * 60_000;

const GENERIC_ERROR = "出了點問題，晚點再試一次。";
const TIMEOUT_ERROR = "處理逾時，晚點再試一次。";

/** 訊息可以直接給使用者看的錯誤（例如輸入格式錯誤） */
export class UserFacingError extends Error {}

class WorkTimeoutError extends Error {}

export interface DeferrableInteraction {
  deferReply(options: { flags?: number }): Promise<unknown>;
  editReply(content: string): Promise<unknown>;
}

export interface DeferOptions {
  ephemeral?: boolean;
  timeoutMs?: number;
  logError?: (error: unknown) => void;
}

export function truncate(text: string, limit = DISCORD_MESSAGE_LIMIT): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WorkTimeoutError()), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function errorReply(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof WorkTimeoutError) return TIMEOUT_ERROR;
  return GENERIC_ERROR;
}

export async function runDeferred(
  interaction: DeferrableInteraction,
  work: () => Promise<string>,
  { ephemeral = false, timeoutMs = DEFAULT_WORK_TIMEOUT_MS, logError = console.error }: DeferOptions = {},
): Promise<void> {
  await interaction.deferReply(ephemeral ? { flags: EPHEMERAL_FLAG } : {});
  let content: string;
  try {
    content = await withTimeout(work(), timeoutMs);
  } catch (error) {
    if (!(error instanceof UserFacingError)) logError(error);
    content = errorReply(error);
  }
  await interaction.editReply(truncate(content));
}
