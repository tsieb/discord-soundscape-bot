import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  GatewayIntentBits,
  PermissionFlagsBits,
} from 'discord.js';
import { AudioPlayerService } from './services/audio-player';
import { SessionManager } from './services/session-manager';
import { Command } from './types';
import * as logger from './util/logger';

const COMMAND_CHANNEL_PERMISSION_FLAGS = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
] as const;

const getCommandChannelPermissionLabel = (permissionFlag: bigint): string => {
  if (permissionFlag === PermissionFlagsBits.SendMessages) {
    return 'Send Messages';
  }

  if (permissionFlag === PermissionFlagsBits.EmbedLinks) {
    return 'Embed Links';
  }

  return `Unknown (${permissionFlag.toString()})`;
};

const getMissingCommandChannelPermissions = (
  interaction: ChatInputCommandInteraction,
): string[] => {
  const appPermissions = interaction.appPermissions;
  if (appPermissions === null) {
    return COMMAND_CHANNEL_PERMISSION_FLAGS.map((permissionFlag) => {
      return getCommandChannelPermissionLabel(permissionFlag);
    });
  }

  return COMMAND_CHANNEL_PERMISSION_FLAGS.filter((permissionFlag) => {
    return !appPermissions.has(permissionFlag);
  }).map((permissionFlag) => {
    return getCommandChannelPermissionLabel(permissionFlag);
  });
};

const replyMissingCommandChannelPermissions = async (
  interaction: ChatInputCommandInteraction,
  missingPermissions: string[],
): Promise<void> => {
  const content = `I need the following permissions in this channel to respond: ${missingPermissions.join(', ')}. Please grant them and try again.`;

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
      return;
    }

    await interaction.reply({ content, ephemeral: true });
  } catch (error: unknown) {
    logger.warn(
      `Unable to reply about missing command channel permissions for /${interaction.commandName}.`,
    );
    logger.debug(`Permission reply error details: ${String(error)}`);
  }
};

export const createClient = (
  commands: Collection<string, Command>,
  audioPlayerService: AudioPlayerService,
  sessionManager: SessionManager,
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
    sessionManager.handleVoiceStateUpdate(oldState, newState);
  });

  client.on('guildDelete', (guild) => {
    if (!sessionManager.hasSession(guild.id)) {
      return;
    }

    logger.warn(`Bot removed from guild ${guild.id}. Cleaning up active session.`);
    sessionManager.destroySession(guild.id);
  });

  client.on('interactionCreate', async (interaction) => {
    if (interaction.isAutocomplete()) {
      const command = commands.get(interaction.commandName);
      if (command?.autocomplete === undefined) {
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error: unknown) {
        logger.error(
          `Autocomplete execution failed for /${interaction.commandName}.`,
          error,
        );
      }
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const missingChannelPermissions =
      getMissingCommandChannelPermissions(interaction);
    if (missingChannelPermissions.length > 0) {
      await replyMissingCommandChannelPermissions(
        interaction,
        missingChannelPermissions,
      );
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
