/**
 * 語音頻道進出。目前只負責連線，不播放也不收音（selfDeaf），之後的 TTS 會用這條連線。
 */
import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";
import type { DiscordGatewayAdapterCreator, VoiceConnection } from "@discordjs/voice";
import { UserFacingError } from "./defer.ts";

const READY_TIMEOUT_MS = 20_000;
const RECONNECT_GRACE_MS = 5_000;
/** 頻道裡沒有真人之後，等多久自動離開 */
export const AUTO_LEAVE_DELAY_MS = 60_000;

export interface UserVoiceChannel {
  id: string;
  name: string;
  /** bot 有沒有權限加入（連線權限、人數上限） */
  joinable: boolean;
}

export interface GuildVoiceContext {
  guildId: string;
  adapterCreator: DiscordGatewayAdapterCreator;
  /** 下指令的人目前所在的語音頻道 */
  userChannel: UserVoiceChannel | null;
}

/** 斷線時（例如被拖到別的頻道）先等它自己重連，等不到才放棄這條連線 */
function watchDisconnect(connection: VoiceConnection): void {
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_GRACE_MS),
        entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_GRACE_MS),
      ]);
    } catch {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    }
  });
}

export async function joinUserChannel(g: GuildVoiceContext): Promise<string> {
  const channel = g.userChannel;
  if (!channel) throw new UserFacingError("你要先進一個語音頻道，我才知道要去哪裡。");
  if (!channel.joinable) throw new UserFacingError(`我沒有加入「${channel.name}」的權限，或是頻道已經滿了。`);

  const existing = getVoiceConnection(g.guildId);
  if (existing?.joinConfig.channelId === channel.id && existing.state.status === VoiceConnectionStatus.Ready) {
    return `我已經在「${channel.name}」了。`;
  }

  // 同一個伺服器已有連線時，joinVoiceChannel 會沿用同一個物件移動過去，所以只在新連線時掛監聽
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: g.guildId,
    adapterCreator: g.adapterCreator,
    selfDeaf: true,
  });
  if (connection !== existing) watchDisconnect(connection);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
  } catch (error) {
    connection.destroy();
    throw new Error(`voice connection to ${channel.id} did not become ready`, { cause: error });
  }
  return `已加入「${channel.name}」。`;
}

export function leaveVoice(guildId: string): string {
  const connection = getVoiceConnection(guildId);
  if (!connection) throw new UserFacingError("我現在不在語音頻道裡。");
  connection.destroy();
  return "已離開語音頻道。";
}

/**
 * 依頻道內真人數量排程自動離開：沒人就在 delay 後執行 leave，有人回來就取消。
 * 以 guildId 為 key，同一個伺服器只會有一個計時器。
 */
export class AutoLeaveScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly leave: (guildId: string) => void;
  private readonly delayMs: number;

  constructor(leave: (guildId: string) => void, delayMs = AUTO_LEAVE_DELAY_MS) {
    this.leave = leave;
    this.delayMs = delayMs;
  }

  update(guildId: string, humanCount: number): void {
    if (humanCount > 0) {
      this.cancel(guildId);
      return;
    }
    if (this.timers.has(guildId)) return;
    const timer = setTimeout(() => {
      this.timers.delete(guildId);
      this.leave(guildId);
    }, this.delayMs);
    this.timers.set(guildId, timer);
  }

  cancel(guildId: string): void {
    const timer = this.timers.get(guildId);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.timers.delete(guildId);
  }

  isPending(guildId: string): boolean {
    return this.timers.has(guildId);
  }
}
