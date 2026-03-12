import { Client, GatewayIntentBits } from 'discord.js';

export const createClient = (): Client => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  client.once('ready', (readyClient) => {
    const guildCount = readyClient.guilds.cache.size;
    console.log(
      `[INFO] Bot online as ${readyClient.user.tag} in ${guildCount} guild(s).`,
    );
  });

  client.on('warn', (message) => {
    console.warn(`[WARN] Discord client warning: ${message}`);
  });

  client.on('error', (error) => {
    console.error('[ERROR] Discord client error:', error);
  });

  return client;
};
