import { Client, GatewayIntentBits } from 'discord.js';
import * as logger from './util/logger';

export const createClient = (): Client => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  client.once('ready', (readyClient) => {
    const guildCount = readyClient.guilds.cache.size;
    logger.info(
      `Bot online as ${readyClient.user.tag} in ${guildCount} guild(s).`,
    );
  });

  client.on('warn', (message) => {
    logger.warn(`Discord client warning: ${message}`);
  });

  client.on('error', (error) => {
    logger.error('Discord client error.', error);
  });

  return client;
};
