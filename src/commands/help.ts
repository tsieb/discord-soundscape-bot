import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { Command } from '../types';
import { CommandDependencies } from './types';
import { brandedEmbed, Icons } from '../util/theme';

export const helpCommandData = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show a quick guide for available soundscape commands.');

const createHelpEmbed = (): EmbedBuilder => {
  return brandedEmbed()
    .setTitle(`${Icons.help} Soundscape Bot Help`)
    .setDescription(
      'Use these commands to control random ambient sound playback in voice channels.',
    )
    .addFields(
      {
        name: `${Icons.sounds} Playback`,
        value:
          '`/join` join your voice channel\n`/start` begin random playback\n`/stop` pause playback\n`/leave` disconnect from voice',
      },
      {
        name: `${Icons.config} Status & Settings`,
        value:
          '`/status` show current session details\n`/config view` view settings\n`/config set` update interval/volume\n`/config reset` restore defaults',
      },
      {
        name: `${Icons.info} Sound Library`,
        value:
          '`/sounds list` list available sounds\n`/sounds add` upload a sound file\n`/sounds remove` delete by name\n`/sounds play` trigger one sound now',
      },
      {
        name: `${Icons.success} Quick Tips`,
        value:
          '1. Run `npm run generate-sounds` to create starter sounds.\n2. Add your own clips to `sounds/` for custom categories.\n3. Tune pacing with `/config set min_interval:<sec> max_interval:<sec>`.',
      },
    );
};

export const createHelpCommand = (
  dependencies: CommandDependencies,
): Command => {
  void dependencies;

  return {
    data: helpCommandData,
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({ embeds: [createHelpEmbed()] });
    },
  };
};
