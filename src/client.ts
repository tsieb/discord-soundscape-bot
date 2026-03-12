import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { AudioPlayerService } from './services/audio-player';
import { Command } from './types';
import * as logger from './util/logger';

export const createClient = (
  commands: Collection<string, Command>,
  audioPlayerService: AudioPlayerService,
): Client => {
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

  client.on('voiceStateUpdate', (oldState, newState) => {
    audioPlayerService.handleVoiceStateUpdate(oldState, newState);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commands.get(interaction.commandName);
    if (command === undefined) {
      logger.warn(`Received unknown command: /${interaction.commandName}`);
      await interaction.reply({
        content: 'Unknown command. Try redeploying slash commands.',
        ephemeral: true,
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error: unknown) {
      logger.error(`Command execution failed for /${interaction.commandName}.`, error);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'An unexpected error occurred while running that command.',
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: 'An unexpected error occurred while running that command.',
        ephemeral: true,
      });
    }
  });

  return client;
};
