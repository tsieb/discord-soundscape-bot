import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Command } from '../types';
import { CommandDependencies } from './types';

export const stopCommandData = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop scheduled playback without leaving voice.');

export const createStopCommand = (
  dependencies: CommandDependencies,
): Command => {
  return {
    data: stopCommandData,
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      const session = dependencies.sessionManager.getSession(interaction.guildId);
      if (session === undefined || !session.isPlaying) {
        await interaction.reply('Playback is not currently running.');
        return;
      }

      dependencies.sessionManager.stopPlayback(interaction.guildId);
      await interaction.reply(
        'Stopped. Use `/start` to resume or `/leave` to disconnect.',
      );
    },
  };
};
