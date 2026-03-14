import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import {
  CURVE_PRESET_NAMES,
  CurvePresetName,
} from '../data/curve-presets';
import { buildCdf, sampleFromCdf } from '../services/density-curve-math';
import { GuildConfig, Command } from '../types';
import { CommandDependencies } from './types';
import { brandedEmbed, EmbedColors, Icons } from '../util/theme';

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
  })
  .addSubcommandGroup((group) => {
    return group
      .setName('density')
      .setDescription('Manage the guild density curve preset.')
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('preset')
          .setDescription('Apply a named density preset.')
          .addStringOption((option) => {
            return option
              .setName('name')
              .setDescription('Preset to apply.')
              .setRequired(true)
              .setAutocomplete(true);
          });
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('view')
          .setDescription('View the active density preset and sample quantiles.');
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('reset')
          .setDescription('Revert density shaping to the ambient default.');
      });
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

const formatPresetLabel = (presetName: string): string => {
  if (presetName === 'custom') {
    return 'Custom';
  }

  return presetName.charAt(0).toUpperCase() + presetName.slice(1);
};

const formatSampleQuantile = (seconds: number): string => {
  if (seconds >= 60) {
    return `${(seconds / 60).toFixed(1)}m (${Math.round(seconds)}s)`;
  }

  return `${seconds.toFixed(1)}s`;
};

const getPeakGapSeconds = (
  dependencies: CommandDependencies,
  guildId: string,
): number => {
  if (dependencies.densityCurveService.isUniformPreset(guildId)) {
    const config = dependencies.configService.getConfig(guildId);
    return (config.minInterval + config.maxInterval) / 2;
  }

  const curve = dependencies.densityCurveService.getCurve(guildId);
  return curve.reduce((peakPoint, point) => {
    return point.d > peakPoint.d ? point : peakPoint;
  }).t;
};

const getQuantiles = (
  dependencies: CommandDependencies,
  guildId: string,
): { p25: number; p50: number; p75: number } => {
  if (dependencies.densityCurveService.isUniformPreset(guildId)) {
    const config = dependencies.configService.getConfig(guildId);
    const span = config.maxInterval - config.minInterval;

    return {
      p25: config.minInterval + span * 0.25,
      p50: config.minInterval + span * 0.5,
      p75: config.minInterval + span * 0.75,
    };
  }

  const cdf = buildCdf(dependencies.densityCurveService.getCurve(guildId));
  return {
    p25: sampleFromCdf(cdf, 0.25),
    p50: sampleFromCdf(cdf, 0.5),
    p75: sampleFromCdf(cdf, 0.75),
  };
};

const createConfigEmbed = (
  title: string,
  description: string,
  config: GuildConfig,
): ReturnType<typeof brandedEmbed> => {
  return brandedEmbed(EmbedColors.primary).setTitle(title).setDescription(description).addFields(
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
    `${Icons.config} Current Configuration`,
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
    `${Icons.success} Configuration Updated`,
    'Settings were saved and applied.',
    updatedConfig,
  ).setColor(EmbedColors.success);
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
    `${Icons.warning} Configuration Reset`,
    'Settings were reset to defaults.',
    defaultConfig,
  ).setColor(EmbedColors.warning);
  await interaction.reply({ embeds: [embed] });
};

const handleDensityPresetSubcommand = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
  guildId: string,
): Promise<void> => {
  const presetName = interaction.options.getString('name');
  if (presetName === null || !CURVE_PRESET_NAMES.includes(presetName as CurvePresetName)) {
    await interaction.reply({
      content: 'Choose a valid density preset.',
      ephemeral: true,
    });
    return;
  }

  await dependencies.densityCurveService.applyPreset(
    guildId,
    presetName as CurvePresetName,
  );

  const peakGapSeconds = getPeakGapSeconds(dependencies, guildId);
  const embed = brandedEmbed(EmbedColors.success)
    .setTitle(`${Icons.success} Density Preset Applied`)
    .setDescription('The scheduler will use the updated timing shape on the next cycle.')
    .addFields(
      {
        name: 'Preset',
        value: formatPresetLabel(presetName),
        inline: true,
      },
      {
        name: 'Peak Gap',
        value: formatDuration(Math.round(peakGapSeconds)),
        inline: true,
      },
    );

  await interaction.reply({ embeds: [embed] });
};

const handleDensityViewSubcommand = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
  guildId: string,
): Promise<void> => {
  const presetName = dependencies.densityCurveService.getPresetName(guildId);
  const peakGapSeconds = getPeakGapSeconds(dependencies, guildId);
  const quantiles = getQuantiles(dependencies, guildId);

  const embed = brandedEmbed(EmbedColors.primary)
    .setTitle(`${Icons.status} Density Configuration`)
    .setDescription('Current timing distribution for this guild.')
    .addFields(
      {
        name: 'Preset',
        value: formatPresetLabel(presetName),
        inline: true,
      },
      {
        name: 'Peak Gap',
        value: formatDuration(Math.round(peakGapSeconds)),
        inline: true,
      },
      {
        name: 'p25',
        value: formatSampleQuantile(quantiles.p25),
        inline: true,
      },
      {
        name: 'p50',
        value: formatSampleQuantile(quantiles.p50),
        inline: true,
      },
      {
        name: 'p75',
        value: formatSampleQuantile(quantiles.p75),
        inline: true,
      },
    );

  await interaction.reply({ embeds: [embed] });
};

const handleDensityResetSubcommand = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
  guildId: string,
): Promise<void> => {
  await dependencies.densityCurveService.applyPreset(guildId, 'ambient');

  const embed = brandedEmbed(EmbedColors.warning)
    .setTitle(`${Icons.warning} Density Reset`)
    .setDescription('Density shaping was reset to the ambient default preset.')
    .addFields({
      name: 'Preset',
      value: formatPresetLabel('ambient'),
      inline: true,
    });

  await interaction.reply({ embeds: [embed] });
};

export const createConfigCommand = (
  dependencies: CommandDependencies,
): Command => {
  return {
    data: configCommandData,
    autocomplete: async (
      interaction: AutocompleteInteraction,
    ): Promise<void> => {
      if (interaction.options.getSubcommandGroup() !== 'density') {
        await interaction.respond([]);
        return;
      }

      if (interaction.options.getSubcommand() !== 'preset') {
        await interaction.respond([]);
        return;
      }

      const focused = interaction.options.getFocused().toLowerCase();
      const choices = CURVE_PRESET_NAMES.filter((presetName) => {
        return presetName.includes(focused);
      }).slice(0, 25);

      await interaction.respond(
        choices.map((presetName) => ({
          name: formatPresetLabel(presetName),
          value: presetName,
        })),
      );
    },
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      const guildId = interaction.guildId;
      const subcommandGroup = interaction.options.getSubcommandGroup();
      const subcommand = interaction.options.getSubcommand();

      if (subcommandGroup === 'density') {
        if (subcommand === 'preset') {
          await handleDensityPresetSubcommand(interaction, dependencies, guildId);
          return;
        }

        if (subcommand === 'view') {
          await handleDensityViewSubcommand(interaction, dependencies, guildId);
          return;
        }

        await handleDensityResetSubcommand(interaction, dependencies, guildId);
        return;
      }

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
