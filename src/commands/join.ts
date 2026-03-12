import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
  VoiceBasedChannel,
} from 'discord.js';
import * as logger from '../util/logger';
import { Command } from '../types';
import { CommandDependencies } from './types';

export const joinCommandData = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join your current voice channel.');

const VOICE_PERMISSION_FLAGS = [
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
] as const;

const getVoicePermissionLabel = (permissionFlag: bigint): string => {
  if (permissionFlag === PermissionFlagsBits.Connect) {
    return 'Connect';
  }

  if (permissionFlag === PermissionFlagsBits.Speak) {
    return 'Speak';
  }

  return `Unknown (${permissionFlag.toString()})`;
};

const getMissingVoicePermissions = (
  voiceChannel: VoiceBasedChannel,
  member: GuildMember,
): string[] => {
  const permissions = voiceChannel.permissionsFor(member);
  if (permissions === null) {
    return VOICE_PERMISSION_FLAGS.map((permissionFlag) => {
      return getVoicePermissionLabel(permissionFlag);
    });
  }

  return VOICE_PERMISSION_FLAGS.filter((permissionFlag) => {
    return !permissions.has(permissionFlag);
  }).map((permissionFlag) => {
    return getVoicePermissionLabel(permissionFlag);
  });
};

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

      const botMember = interaction.guild?.members.me;
      if (botMember === null || botMember === undefined) {
        await interaction.reply({
          content:
            'I could not verify my server permissions. Please try again in a moment.',
          ephemeral: true,
        });
        return;
      }

      const missingVoicePermissions = getMissingVoicePermissions(
        voiceChannel,
        botMember,
      );
      if (missingVoicePermissions.length > 0) {
        await interaction.reply({
          content: `I cannot join **#${voiceChannel.name}** yet. Please grant me: ${missingVoicePermissions.join(', ')} in that voice channel.`,
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
