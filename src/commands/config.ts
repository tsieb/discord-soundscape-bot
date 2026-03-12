import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { GuildConfig, Command } from '../types';
import { CommandDependencies } from './types';

const MIN_ALLOWED_INTERVAL_SECONDS = 5;
const MIN_VOLUME = 0;
const MAX_VOLUME = 1;

export const configCommandData = new SlashCommandBuilder()
  .setName('config')
  .setDescription('View or update guild soundscape settings.')
  .addSubcommand((subcommand) => {
    return subcommand
      .setName('view')
      .setDescription('View current guild settings.');
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName('set')
      .setDescription('Update one or more guild settings.')
      .addIntegerOption((option) => {
        return option
          .setName('min_interval')
          .setDescription('Minimum seconds between sounds (>= 5).')
          .setRequired(false);
      })
      .addIntegerOption((option) => {
        return option
          .setName('max_interval')
          .setDescription('Maximum seconds between sounds.')
          .setRequired(false);
      })
      .addNumberOption((option) => {
        return option
          .setName('volume')
          .setDescription('Playback volume from 0.0 to 1.0.')
          .setRequired(false);
      });
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName('reset')
      .setDescription('Reset guild settings back to defaults.');
  });

const formatDuration = (seconds: number): string => {
  if (seconds % 60 === 0 && seconds >= 60) {
    return `${seconds / 60}m`;
  }

  return `${seconds}s`;
};

const formatVolume = (volume: number): string => {
  return `${Math.round(volume * 100)}% (${volume.toFixed(2)})`;
};

const createConfigEmbed = (
  title: string,
  description: string,
  config: GuildConfig,
): EmbedBuilder => {
  return new EmbedBuilder().setTitle(title).setDescription(description).addFields(
    {
      name: 'Min Interval',
      value: formatDuration(config.minInterval),
      inline: true,
    },
    {
      name: 'Max Interval',
      value: formatDuration(config.maxInterval),
      inline: true,
    },
    {
      name: 'Volume',
      value: formatVolume(config.volume),
      inline: true,
    },
  );
};

const handleViewSubcommand = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
  guildId: string,
): Promise<void> => {
  const config = dependencies.configService.getConfig(guildId);
  const embed = createConfigEmbed(
    'Current Configuration',
    'Guild settings currently in effect.',
    config,
  );

  await interaction.reply({ embeds: [embed] });
};

const handleSetSubcommand = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
  guildId: string,
): Promise<void> => {
  const minInterval = interaction.options.getInteger('min_interval');
  const maxInterval = interaction.options.getInteger('max_interval');
  const volume = interaction.options.getNumber('volume');

  if (minInterval === null && maxInterval === null && volume === null) {
    await interaction.reply({
      content: 'Provide at least one option to update.',
      ephemeral: true,
    });
    return;
  }

  const currentConfig = dependencies.configService.getConfig(guildId);
  const nextMinInterval = minInterval ?? currentConfig.minInterval;
  const nextMaxInterval = maxInterval ?? currentConfig.maxInterval;

  if (nextMinInterval < MIN_ALLOWED_INTERVAL_SECONDS) {
    await interaction.reply({
      content: `min_interval must be at least ${MIN_ALLOWED_INTERVAL_SECONDS} seconds.`,
      ephemeral: true,
    });
    return;
  }

  if (nextMaxInterval < nextMinInterval) {
    await interaction.reply({
      content: 'max_interval must be greater than or equal to min_interval.',
      ephemeral: true,
    });
    return;
  }

  if (volume !== null && (volume < MIN_VOLUME || volume > MAX_VOLUME)) {
    await interaction.reply({
      content: 'volume must be between 0.0 and 1.0.',
      ephemeral: true,
    });
    return;
  }

  dependencies.configService.setConfig(guildId, {
    minInterval: minInterval ?? undefined,
    maxInterval: maxInterval ?? undefined,
    volume: volume ?? undefined,
  });

  const updatedConfig = dependencies.configService.getConfig(guildId);
  dependencies.sessionManager.updateSessionConfig(guildId, updatedConfig);

  const embed = createConfigEmbed(
    'Configuration Updated',
    'Settings were saved and applied.',
    updatedConfig,
  );
  await interaction.reply({ embeds: [embed] });
};

const handleResetSubcommand = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
  guildId: string,
): Promise<void> => {
  const defaultConfig = dependencies.configService.resetConfig(guildId);
  dependencies.sessionManager.updateSessionConfig(guildId, defaultConfig);

  const embed = createConfigEmbed(
    'Configuration Reset',
    'Settings were reset to defaults.',
    defaultConfig,
  );
  await interaction.reply({ embeds: [embed] });
};

export const createConfigCommand = (
  dependencies: CommandDependencies,
): Command => {
  return {
    data: configCommandData,
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'view') {
        await handleViewSubcommand(interaction, dependencies, guildId);
        return;
      }

      if (subcommand === 'set') {
        await handleSetSubcommand(interaction, dependencies, guildId);
        return;
      }

      await handleResetSubcommand(interaction, dependencies, guildId);
    },
  };
};
