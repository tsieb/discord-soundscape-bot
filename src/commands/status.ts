import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../types';
import { CommandDependencies } from './types';

export const statusCommandData = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show the current soundscape status for this server.');

const formatDuration = (seconds: number): string => {
  if (seconds % 60 === 0 && seconds >= 60) {
    return `${seconds / 60}m`;
  }

  return `${seconds}s`;
};

const formatVolume = (volume: number): string => {
  return `${Math.round(volume * 100)}%`;
};

const formatUptime = (startedAt: Date): string => {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
};

const formatNextSoundEta = (nextPlayTime: number | null): string => {
  if (nextPlayTime === null) {
    return 'Not scheduled';
  }

  const nextTimestampSeconds = Math.floor(nextPlayTime / 1000);
  return `<t:${nextTimestampSeconds}:R>`;
};

export const createStatusCommand = (
  dependencies: CommandDependencies,
): Command => {
  return {
    data: statusCommandData,
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      const session = dependencies.sessionManager.getSession(interaction.guildId);
      const config =
        session?.config ?? dependencies.configService.getConfig(interaction.guildId);
      const channelDisplay =
        session === undefined ? 'Not connected' : `<#${session.channelId}>`;
      const playbackDisplay =
        session?.isPlaying === true ? 'Active' : 'Stopped';
      const nextSoundEta =
        session?.isPlaying === true
          ? formatNextSoundEta(session.scheduler.getNextPlayTime())
          : 'Not scheduled';

      const embed = new EmbedBuilder()
        .setTitle('Soundscape Status')
        .setDescription(
          session === undefined
            ? 'Bot is currently idle. Use `/join` then `/start` to begin.'
            : 'Current session details for this guild.',
        )
        .addFields(
          {
            name: 'Connected Channel',
            value: channelDisplay,
            inline: true,
          },
          {
            name: 'Playback',
            value: playbackDisplay,
            inline: true,
          },
          {
            name: 'Sound Library',
            value: `${dependencies.soundLibrary.getSoundCount()} sound(s)`,
            inline: true,
          },
          {
            name: 'Config',
            value: `Interval: ${formatDuration(config.minInterval)} - ${formatDuration(config.maxInterval)}\nVolume: ${formatVolume(config.volume)}`,
            inline: false,
          },
          {
            name: 'Next Sound ETA',
            value: nextSoundEta,
            inline: true,
          },
          {
            name: 'Uptime',
            value: formatUptime(dependencies.startedAt),
            inline: true,
          },
        );

      await interaction.reply({ embeds: [embed] });
    },
  };
};
