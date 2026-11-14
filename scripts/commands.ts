/**
 * Slash command 處理程式，由 start.ps1 和 Claude session 一起啟動。
 *
 * 和 Discord 插件共用同一個 bot token，各自開一條 Gateway 連線：
 * - 插件負責聊天訊息和權限請求的 Allow/Deny 按鈕
 * - 這裡只處理 slash command（chat input），其他 interaction 一律不碰
 * 不要在 Developer Portal 設定 Interactions Endpoint URL，否則所有 interaction 都會改走 HTTP，插件的按鈕會失效。
 *
 * 環境變數：DISCORD_BOT_TOKEN、CLAUDE_BOT_NAME、DISCORD_ADMIN_USER_ID，
 * 選填 DISCORD_GUILD_ID（設定後註冊為伺服器指令，立即生效；未設定則註冊為全域指令）。
 */
import fs from "node:fs";
import path from "node:path";
import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { runDeferred } from "../lib/commands/defer.ts";
import { findCommand, parseEnabledCommands, toRegistrationBody } from "../lib/commands/registry.ts";
import { PROJECT_ROOT } from "../lib/commands/run_script.ts";

const ADMIN_ONLY_REPLY = "這個指令只有管理員能用。";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function loadEnabledCommands(botName: string): string[] {
  const file = path.join(PROJECT_ROOT, "bots", botName, "commands.json");
  if (!fs.existsSync(file)) throw new Error(`${file} not found`);
  return parseEnabledCommands(fs.readFileSync(file, "utf8"));
}

async function registerCommands(token: string, applicationId: string, names: readonly string[]): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);
  await new REST().setToken(token).put(route, { body: toRegistrationBody(names) });
  console.info(`registered ${guildId ? `guild ${guildId}` : "global"} commands: ${names.join(", ")}`);
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  enabled: ReadonlySet<string>,
  adminId: string,
): Promise<void> {
  const spec = findCommand(interaction.commandName);
  if (!spec || !enabled.has(spec.name)) return;

  if (spec.adminOnly && interaction.user.id !== adminId) {
    await interaction.reply({ content: ADMIN_ONLY_REPLY, flags: MessageFlags.Ephemeral });
    return;
  }

  await runDeferred(
    {
      deferReply: (options) => interaction.deferReply(options),
      editReply: (content) => interaction.editReply(content),
    },
    () => spec.run({ username: interaction.user.username, getString: (n) => interaction.options.getString(n) }),
    { ephemeral: spec.ephemeral },
  );
}

async function main(): Promise<void> {
  const token = requireEnv("DISCORD_BOT_TOKEN");
  const botName = requireEnv("CLAUDE_BOT_NAME");
  const adminId = requireEnv("DISCORD_ADMIN_USER_ID");
  const names = loadEnabledCommands(botName);
  const enabled = new Set(names);

  // Interaction 不受 intent 限制，Guilds 是登入所需的最小 intent
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (ready) => {
    console.info(`[${botName}] commands online as ${ready.user.tag}`);
    try {
      await registerCommands(token, ready.application.id, names);
    } catch (error) {
      console.error("command registration failed:", error);
    }
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    handleCommand(interaction, enabled, adminId).catch((error: unknown) => {
      console.error(`/${interaction.commandName} failed:`, error);
    });
  });

  await client.login(token);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
