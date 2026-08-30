import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const required = ['DISCORD_BOT_TOKEN', 'N8N_WEBHOOK_URL', 'COUNCIL_WEBHOOK_SECRET'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing environment variable: ${name}`);
}

const allowedChannelId = process.env.DISCORD_ALLOWED_CHANNEL_ID || null;
const seenMessages = new Map();
const seenTtlMs = 10 * 60 * 1000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function trimMention(content, botId) {
  return content
    .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
    .trim();
}

function rememberMessage(messageId) {
  const now = Date.now();
  for (const [id, timestamp] of seenMessages) {
    if (now - timestamp > seenTtlMs) seenMessages.delete(id);
  }
  if (seenMessages.has(messageId)) return false;
  seenMessages.set(messageId, now);
  return true;
}

client.once('ready', () => {
  console.log(`World Agent connected as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !client.user || !message.mentions.has(client.user)) return;
  if (allowedChannelId && message.channelId !== allowedChannelId) return;
  if (!rememberMessage(message.id)) return;

  const userMessage = trimMention(message.content, client.user.id);
  if (!userMessage) {
    await message.reply('검토할 내용을 함께 입력해 주세요. 예: `@World Life Thread 구조를 검토해봐`');
    return;
  }

  await message.channel.sendTyping();

  try {
    const response = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-council-secret': process.env.COUNCIL_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        agent: 'world',
        message_id: message.id,
        channel_id: message.channelId,
        guild_id: message.guildId,
        author_id: message.author.id,
        author_name: message.author.globalName || message.author.username,
        user_message: userMessage,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `n8n returned HTTP ${response.status}`);
    }

    const content = String(result.content || '').trim();
    if (!content) throw new Error('n8n returned an empty response');
    await message.reply(content.slice(0, 1900));
  } catch (error) {
    console.error(error);
    await message.reply('World Agent 연결 중 오류가 발생했습니다. n8n 실행 상태와 workflow 로그를 확인해 주세요.');
  }
});

await client.login(process.env.DISCORD_BOT_TOKEN);
