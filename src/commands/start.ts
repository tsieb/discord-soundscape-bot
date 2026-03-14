import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types';
import { CommandDependencies } from './types';

export const startCommandData = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Start the random soundscape loop.');

const formatDuration = (seconds: number): string => {
  if (seconds % 60 === 0 && seconds >= 60) {
    return `${seconds / 60}m`;
  }

  return `${seconds}s`;
};

export const createStartCommand = (
  dependencies: CommandDependencies,
): Command => {
  return {
    data: startCommandData,
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      const session = dependencies.sessionManager.getSession(interaction.guildId);
      if (session === undefined) {
        await interaction.reply({
          content: 'No active session found. Use `/join` first.',
          ephemeral: true,
        });
        return;
      }

      if (session.isPlaying) {
        await interaction.reply('Playback is already running.');
        return;
      }

      const started = dependencies.sessionManager.startPlayback(interaction.guildId);
      if (!started) {
        await interaction.reply({
          content:
            'No sounds are available right now. Add sounds with `/sounds add` and try `/start` again.',
          ephemeral: true,
        });
        return;
      }

      const timerCount = dependencies.sessionManager.getSoundTimerCount(
        interaction.guildId,
      );
      const timerLabel = timerCount === 1 ? 'timer' : 'timers';
      const verb = timerCount === 1 ? 'is' : 'are';
      const intervalRange = `${formatDuration(session.config.minInterval)} - ${formatDuration(session.config.maxInterval)}`;
      await interaction.reply(
        `Started! ${timerCount} independent ${timerLabel} ${verb} running in the **${intervalRange}** range.`,
      );
    },
  };
};
