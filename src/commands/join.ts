import {
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
  VoiceBasedChannel,
} from 'discord.js';
import * as logger from '../util/logger';
import { Command } from '../types';
import { CommandDependencies } from './types';

export const joinCommandData = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join your current voice channel.');

const getInvokerVoiceChannel = async (
  interaction: ChatInputCommandInteraction,
): Promise<VoiceBasedChannel | null> => {
  const guild = interaction.guild;
  if (guild === null) {
    return null;
  }

  const member = await guild.members.fetch(interaction.user.id);
  if (!(member instanceof GuildMember)) {
    return null;
  }

  const channel = member.voice.channel;
  if (channel?.isVoiceBased() !== true) {
    return null;
  }

  return channel;
};

export const createJoinCommand = (
  dependencies: CommandDependencies,
): Command => {
  return {
    data: joinCommandData,
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      const voiceChannel = await getInvokerVoiceChannel(interaction);
      if (voiceChannel === null) {
        await interaction.reply({
          content: 'You need to join a voice channel first.',
          ephemeral: true,
        });
        return;
      }

      try {
        const config = dependencies.configService.getConfig(interaction.guildId);
        await dependencies.sessionManager.createSession(
          interaction.guildId,
          voiceChannel,
          config,
        );
      } catch (error: unknown) {
        logger.error(
          `Failed to join voice channel for guild ${interaction.guildId}.`,
          error,
        );
        await interaction.reply({
          content:
            'I could not join your voice channel. Please check my voice permissions and try again.',
          ephemeral: true,
        });
        return;
      }

      await interaction.reply(`Joined **#${voiceChannel.name}**.`);
    },
  };
};
