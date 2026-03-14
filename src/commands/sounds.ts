import {
  Attachment,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import {
  InvalidSoundCategoryError,
  SoundNotFoundError,
  SUPPORTED_SOUND_EXTENSIONS,
  UnsupportedSoundFormatError,
} from '../services/sound-library';
import * as logger from '../util/logger';
import { Command, SoundConfig, SoundFile } from '../types';
import { CommandDependencies } from './types';
import { brandedEmbed, EmbedColors, Icons } from '../util/theme';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const EMBED_DESCRIPTION_CHAR_LIMIT = 3800;
const SOUND_NAME_AUTOCOMPLETE_LIMIT = 25;
const CONFIGURED_SOUND_SUFFIX = ' \u2699';

type SoundConfigMutation =
  | { fieldName: 'Volume'; patch: Partial<SoundConfig> }
  | { fieldName: 'Weight'; patch: Partial<SoundConfig> }
  | { fieldName: 'Interval Override'; patch: Partial<SoundConfig> }
  | { fieldName: 'Interval Override'; patch: { minInterval: undefined; maxInterval: undefined } }
  | { fieldName: 'Enabled'; patch: Partial<SoundConfig> };

export const soundsCommandData = new SlashCommandBuilder()
  .setName('sounds')
  .setDescription('Browse and manage the sound library.')
  .addSubcommand((subcommand) => {
    return subcommand
      .setName('list')
      .setDescription('List available sounds.')
      .addStringOption((option) => {
        return option
          .setName('category')
          .setDescription('Filter by category.')
          .setRequired(false);
      });
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName('add')
      .setDescription('Upload a new sound file.')
      .addAttachmentOption((option) => {
        return option
          .setName('file')
          .setDescription('Audio file to upload.')
          .setRequired(true);
      })
      .addStringOption((option) => {
        return option
          .setName('category')
          .setDescription('Optional category to place this sound under.')
          .setRequired(false);
      });
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName('remove')
      .setDescription('Remove a sound by name.')
      .addStringOption((option) => {
        return option
          .setName('name')
          .setDescription('Sound name (without extension).')
          .setAutocomplete(true)
          .setRequired(true);
      });
  })
  .addSubcommand((subcommand) => {
    return subcommand
      .setName('play')
      .setDescription('Play a specific sound immediately.')
      .addStringOption((option) => {
        return option
          .setName('name')
          .setDescription('Sound name (without extension).')
          .setAutocomplete(true)
          .setRequired(true);
      });
  })
  .addSubcommandGroup((group) => {
    return group
      .setName('config')
      .setDescription('View and update per-sound configuration.')
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('view')
          .setDescription('View config for one sound or the full library.')
          .addStringOption((option) => {
            return option
              .setName('sound')
              .setDescription('Optional sound to inspect.')
              .setAutocomplete(true)
              .setRequired(false);
          });
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('volume')
          .setDescription('Set the per-sound volume multiplier.')
          .addStringOption((option) => {
            return option
              .setName('sound')
              .setDescription('Sound to update.')
              .setAutocomplete(true)
              .setRequired(true);
          })
          .addNumberOption((option) => {
            return option
              .setName('value')
              .setDescription('Volume multiplier between 0.0 and 2.0.')
              .setRequired(true);
          });
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('weight')
          .setDescription('Set how often the sound is scheduled.')
          .addStringOption((option) => {
            return option
              .setName('sound')
              .setDescription('Sound to update.')
              .setAutocomplete(true)
              .setRequired(true);
          })
          .addNumberOption((option) => {
            return option
              .setName('value')
              .setDescription('Weight between 0.1 and 10.0.')
              .setRequired(true);
          });
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('interval')
          .setDescription('Override min and max interval for one sound.')
          .addStringOption((option) => {
            return option
              .setName('sound')
              .setDescription('Sound to update.')
              .setAutocomplete(true)
              .setRequired(true);
          })
          .addIntegerOption((option) => {
            return option
              .setName('min')
              .setDescription('Minimum seconds between plays.')
              .setRequired(true);
          })
          .addIntegerOption((option) => {
            return option
              .setName('max')
              .setDescription('Maximum seconds between plays.')
              .setRequired(true);
          });
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('interval-reset')
          .setDescription('Clear the per-sound interval override.')
          .addStringOption((option) => {
            return option
              .setName('sound')
              .setDescription('Sound to update.')
              .setAutocomplete(true)
              .setRequired(true);
          });
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('enable')
          .setDescription('Enable a sound for scheduling.')
          .addStringOption((option) => {
            return option
              .setName('sound')
              .setDescription('Sound to enable.')
              .setAutocomplete(true)
              .setRequired(true);
          });
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('disable')
          .setDescription('Disable a sound for scheduling.')
          .addStringOption((option) => {
            return option
              .setName('sound')
              .setDescription('Sound to disable.')
              .setAutocomplete(true)
              .setRequired(true);
          });
      })
      .addSubcommand((subcommand) => {
        return subcommand
          .setName('reset')
          .setDescription('Reset a sound back to default config.')
          .addStringOption((option) => {
            return option
              .setName('sound')
              .setDescription('Sound to reset.')
              .setAutocomplete(true)
              .setRequired(true);
          });
      });
  });

const getFilteredSounds = (
  sounds: SoundFile[],
  categoryFilter: string | null,
): SoundFile[] => {
  if (categoryFilter === null) {
    return sounds;
  }

  const normalizedFilter = categoryFilter.trim().toLowerCase();
  return sounds.filter((sound) => {
    return sound.category.toLowerCase() === normalizedFilter;
  });
};

const getPaginatedDescriptions = (
  sounds: SoundFile[],
  configuredSoundNames: Set<string>,
): string[] => {
  const grouped = new Map<string, string[]>();

  for (const sound of sounds) {
    const existing = grouped.get(sound.category) ?? [];
    const label = configuredSoundNames.has(sound.name)
      ? `${sound.name}${CONFIGURED_SOUND_SUFFIX}`
      : sound.name;
    existing.push(label);
    grouped.set(sound.category, existing);
  }

  const categories = Array.from(grouped.keys()).sort((left, right) => {
    return left.localeCompare(right);
  });

  const lines: string[] = [];
  for (const category of categories) {
    lines.push(`**${category}**`);

    const names = grouped.get(category) ?? [];
    names.sort((left, right) => left.localeCompare(right));
    for (const name of names) {
      lines.push(`- ${name}`);
    }

    lines.push('');
  }

  if (lines.length === 0) {
    return ['No sounds found.'];
  }

  const pages: string[] = [];
  let currentPage = '';

  for (const line of lines) {
    const nextChunk = currentPage === '' ? line : `${currentPage}\n${line}`;
    if (nextChunk.length > EMBED_DESCRIPTION_CHAR_LIMIT && currentPage !== '') {
      pages.push(currentPage);
      currentPage = line;
      continue;
    }

    currentPage = nextChunk;
  }

  if (currentPage !== '') {
    pages.push(currentPage);
  }

  return pages;
};

const formatConfigVolume = (volume: number): string => {
  return `${Math.round(volume * 100)}%`;
};

const formatConfigWeight = (weight: number): string => {
  return `${weight.toFixed(1)}x`;
};

const formatConfigEnabled = (enabled: boolean): string => {
  return enabled ? 'Enabled' : 'Disabled';
};

const formatConfigInterval = (config: SoundConfig): string => {
  if (config.minInterval === undefined || config.maxInterval === undefined) {
    return 'Guild default';
  }

  return `${config.minInterval}s-${config.maxInterval}s`;
};

const formatDetailedConfig = (config: SoundConfig): string => {
  return [
    `Volume: ${formatConfigVolume(config.volume)}`,
    `Weight: ${formatConfigWeight(config.weight)}`,
    `State: ${formatConfigEnabled(config.enabled)}`,
    `Interval: ${formatConfigInterval(config)}`,
  ].join('\n');
};

const getSoundConfigRows = (
  sounds: SoundFile[],
  dependencies: CommandDependencies,
  guildId: string,
): string[] => {
  const sortedSounds = [...sounds].sort((left, right) => {
    return left.name.localeCompare(right.name);
  });

  const lines = [
    '```text',
    'Name                Vol   Wt    State     Interval',
    '--------------------------------------------------',
  ];

  for (const sound of sortedSounds) {
    const config = dependencies.soundConfigService.getSoundConfig(
      guildId,
      sound.name,
    );
    const name = sound.name.length > 18 ? `${sound.name.slice(0, 15)}...` : sound.name;
    const paddedName = name.padEnd(18, ' ');
    const paddedVolume = formatConfigVolume(config.volume).padEnd(5, ' ');
    const paddedWeight = formatConfigWeight(config.weight).padEnd(5, ' ');
    const paddedState = (config.enabled ? 'on' : 'off').padEnd(9, ' ');
    const interval = formatConfigInterval(config);
    lines.push(
      `${paddedName} ${paddedVolume} ${paddedWeight} ${paddedState} ${interval}`,
    );
  }

  lines.push('```');
  return lines;
};

const paginateLines = (lines: string[]): string[] => {
  const pages: string[] = [];
  let currentPage = '';

  for (const line of lines) {
    const nextChunk = currentPage === '' ? line : `${currentPage}\n${line}`;
    if (nextChunk.length > EMBED_DESCRIPTION_CHAR_LIMIT && currentPage !== '') {
      pages.push(currentPage);
      currentPage = line;
      continue;
    }

    currentPage = nextChunk;
  }

  if (currentPage !== '') {
    pages.push(currentPage);
  }

  return pages;
};

const createListEmbed = (
  description: string,
  pageIndex: number,
  pageCount: number,
  totalCount: number,
  categoryFilter: string | null,
): EmbedBuilder => {
  const categoryLabel =
    categoryFilter === null ? 'all categories' : `category "${categoryFilter}"`;
  return brandedEmbed()
    .setTitle(`${Icons.sounds} Sound Library`)
    .setDescription(description)
    .setFooter({
      text: `Total: ${totalCount} sounds in ${categoryLabel} \u2022 Page ${pageIndex + 1}/${pageCount}`,
    });
};

const createSoundConfigOverviewEmbed = (
  description: string,
  pageIndex: number,
  pageCount: number,
  totalCount: number,
): EmbedBuilder => {
  return brandedEmbed()
    .setTitle(`${Icons.config} Sound Config Overview`)
    .setDescription(description)
    .setFooter({
      text: `Showing ${totalCount} sound(s) • Page ${pageIndex + 1}/${pageCount}`,
    });
};

const createSoundConfigDetailEmbed = (
  sound: SoundFile,
  config: SoundConfig,
): EmbedBuilder => {
  return brandedEmbed()
    .setTitle(`${Icons.config} ${sound.name}`)
    .setDescription(`Per-sound settings for **${sound.name}**.`)
    .addFields(
      {
        name: 'Category',
        value: sound.category,
        inline: true,
      },
      {
        name: 'Volume',
        value: `${formatConfigVolume(config.volume)}\nMultiplier relative to guild volume.`,
        inline: true,
      },
      {
        name: 'Weight',
        value: `${formatConfigWeight(config.weight)}\nHigher weight means more frequent scheduling.`,
        inline: true,
      },
      {
        name: 'State',
        value: config.enabled
          ? 'Enabled\nParticipates in scheduling.'
          : 'Disabled\nRemoved from scheduling.',
        inline: true,
      },
      {
        name: 'Interval Override',
        value:
          config.minInterval === undefined || config.maxInterval === undefined
            ? 'Guild default\nUses the guild-wide interval range.'
            : `${config.minInterval}s - ${config.maxInterval}s\nOverrides the guild-wide interval range.`,
        inline: true,
      },
    );
};

const createSoundConfigConfirmationEmbed = (
  sound: SoundFile,
  fieldName: string,
  beforeConfig: SoundConfig,
  afterConfig: SoundConfig,
): EmbedBuilder => {
  return brandedEmbed(EmbedColors.success)
    .setTitle(`${Icons.success} Updated ${sound.name}`)
    .setDescription(`Applied **${fieldName}** changes for **${sound.name}**.`)
    .addFields(
      {
        name: 'Before',
        value: formatDetailedConfig(beforeConfig),
        inline: true,
      },
      {
        name: 'After',
        value: formatDetailedConfig(afterConfig),
        inline: true,
      },
    );
};

const listSounds = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
): Promise<void> => {
  const category = interaction.options.getString('category');
  const sounds = getFilteredSounds(dependencies.soundLibrary.getSounds(), category);
  const configuredSoundNames = new Set(
    Array.from(
      dependencies.soundConfigService
        .getAllSoundConfigs(interaction.guildId ?? '')
        .keys(),
    ),
  );

  if (sounds.length === 0) {
    await interaction.reply({
      embeds: [
        brandedEmbed(EmbedColors.neutral)
          .setTitle(`${Icons.sounds} Sound Library`)
          .setDescription(
            category === null
              ? 'No sounds found in the library.'
              : `No sounds found in category "${category}".`,
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  const pages = getPaginatedDescriptions(sounds, configuredSoundNames);
  const firstEmbed = createListEmbed(
    pages[0],
    0,
    pages.length,
    sounds.length,
    category,
  );
  await interaction.reply({ embeds: [firstEmbed] });

  for (let pageIndex = 1; pageIndex < pages.length; pageIndex += 1) {
    const embed = createListEmbed(
      pages[pageIndex],
      pageIndex,
      pages.length,
      sounds.length,
      category,
    );
    await interaction.followUp({ embeds: [embed] });
  }
};

const getRequiredSound = (
  dependencies: CommandDependencies,
  soundName: string,
): SoundFile | undefined => {
  return dependencies.soundLibrary.getSoundByName(soundName);
};

const replyUnknownSound = async (
  interaction: ChatInputCommandInteraction,
  soundName: string,
): Promise<void> => {
  await interaction.reply({
    content: `Sound "${soundName}" was not found.`,
    ephemeral: true,
  });
};

const viewSoundConfig = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
): Promise<void> => {
  const guildId = interaction.guildId;
  if (guildId === null) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const soundName = interaction.options.getString('sound');
  if (soundName !== null) {
    const sound = getRequiredSound(dependencies, soundName);
    if (sound === undefined) {
      await replyUnknownSound(interaction, soundName);
      return;
    }

    const config = dependencies.soundConfigService.getSoundConfig(
      guildId,
      sound.name,
    );
    await interaction.reply({
      embeds: [createSoundConfigDetailEmbed(sound, config)],
    });
    return;
  }

  const sounds = dependencies.soundLibrary.getSounds();
  if (sounds.length === 0) {
    await interaction.reply({
      embeds: [
        brandedEmbed(EmbedColors.neutral)
          .setTitle(`${Icons.config} Sound Config Overview`)
          .setDescription('No sounds are available in the library yet.'),
      ],
      ephemeral: true,
    });
    return;
  }

  const pages = paginateLines(getSoundConfigRows(sounds, dependencies, guildId));
  await interaction.reply({
    embeds: [createSoundConfigOverviewEmbed(pages[0], 0, pages.length, sounds.length)],
  });

  for (let pageIndex = 1; pageIndex < pages.length; pageIndex += 1) {
    await interaction.followUp({
      embeds: [
        createSoundConfigOverviewEmbed(
          pages[pageIndex],
          pageIndex,
          pages.length,
          sounds.length,
        ),
      ],
    });
  }
};

const updateSoundConfig = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
  mutation: SoundConfigMutation,
): Promise<void> => {
  const guildId = interaction.guildId;
  if (guildId === null) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const requestedSoundName = interaction.options.getString('sound', true);
  const sound = getRequiredSound(dependencies, requestedSoundName);
  if (sound === undefined) {
    await replyUnknownSound(interaction, requestedSoundName);
    return;
  }

  const beforeConfig = dependencies.soundConfigService.getSoundConfig(
    guildId,
    sound.name,
  );
  const afterConfig = await dependencies.soundConfigService.setSoundConfig(
    guildId,
    sound.name,
    mutation.patch,
  );
  dependencies.sessionManager.applySoundConfig(guildId, sound.name);

  await interaction.reply({
    embeds: [
      createSoundConfigConfirmationEmbed(
        sound,
        mutation.fieldName,
        beforeConfig,
        afterConfig,
      ),
    ],
  });
};

const resetSoundConfig = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
): Promise<void> => {
  const guildId = interaction.guildId;
  if (guildId === null) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const requestedSoundName = interaction.options.getString('sound', true);
  const sound = getRequiredSound(dependencies, requestedSoundName);
  if (sound === undefined) {
    await replyUnknownSound(interaction, requestedSoundName);
    return;
  }

  const beforeConfig = dependencies.soundConfigService.getSoundConfig(
    guildId,
    sound.name,
  );
  const afterConfig = await dependencies.soundConfigService.resetSoundConfig(
    guildId,
    sound.name,
  );
  dependencies.sessionManager.applySoundConfig(guildId, sound.name);

  await interaction.reply({
    embeds: [
      createSoundConfigConfirmationEmbed(
        sound,
        'All Settings',
        beforeConfig,
        afterConfig,
      ),
    ],
  });
};

const validateAttachment = (
  attachment: Attachment,
  dependencies: CommandDependencies,
): string | null => {
  const fileName = attachment.name;
  if (fileName === null) {
    return 'The uploaded file must have a filename.';
  }

  if (!dependencies.soundLibrary.isSupportedFileName(fileName)) {
    return `Unsupported file type. Allowed extensions: ${SUPPORTED_SOUND_EXTENSIONS.join(', ')}`;
  }

  if (attachment.size > MAX_UPLOAD_SIZE_BYTES) {
    return `File is too large. Maximum upload size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB.`;
  }

  return null;
};

const downloadAttachment = async (attachment: Attachment): Promise<Buffer> => {
  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(
      `Failed to download attachment. HTTP ${response.status} ${response.statusText}`,
    );
  }

  const fileBytes = await response.arrayBuffer();
  return Buffer.from(fileBytes);
};

const addSound = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
): Promise<void> => {
  const attachment = interaction.options.getAttachment('file', true);
  const category = interaction.options.getString('category');
  const validationError = validateAttachment(attachment, dependencies);

  if (validationError !== null) {
    await interaction.reply({
      content: validationError,
      ephemeral: true,
    });
    return;
  }

  try {
    const fileName = attachment.name;
    if (fileName === null) {
      await interaction.reply({
        content: 'The uploaded file must have a filename.',
        ephemeral: true,
      });
      return;
    }

    const fileBuffer = await downloadAttachment(attachment);
    const addedSound = await dependencies.soundLibrary.addSound(
      fileName,
      fileBuffer,
      category ?? undefined,
    );
    dependencies.sessionManager.syncAllSessionSoundSchedulers();
    await interaction.reply(`Added **${addedSound.name}** to the library.`);
  } catch (error: unknown) {
    if (
      error instanceof UnsupportedSoundFormatError ||
      error instanceof InvalidSoundCategoryError
    ) {
      await interaction.reply({
        content: error.message,
        ephemeral: true,
      });
      return;
    }

    logger.error('Failed to add uploaded sound.', error);
    await interaction.reply({
      content: 'Failed to add that sound file. Please try again.',
      ephemeral: true,
    });
  }
};

const removeSound = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
): Promise<void> => {
  const soundName = interaction.options.getString('name', true);

  try {
    await dependencies.soundLibrary.removeSound(soundName);
    dependencies.sessionManager.syncAllSessionSoundSchedulers();
    await interaction.reply(`Removed **${soundName}** from the library.`);
  } catch (error: unknown) {
    if (error instanceof SoundNotFoundError) {
      await interaction.reply({
        content: `Sound "${soundName}" was not found.`,
        ephemeral: true,
      });
      return;
    }

    logger.error(`Failed to remove sound "${soundName}".`, error);
    await interaction.reply({
      content: 'Failed to remove that sound. Please try again.',
      ephemeral: true,
    });
  }
};

const playSound = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
): Promise<void> => {
  const guildId = interaction.guildId;
  if (guildId === null) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const session = dependencies.sessionManager.getSession(guildId);
  if (session === undefined) {
    await interaction.reply({
      content: 'I am not connected to voice in this server. Use `/join` first.',
      ephemeral: true,
    });
    return;
  }

  const soundName = interaction.options.getString('name', true);
  const sound = dependencies.soundLibrary.getSoundByName(soundName);
  if (sound === undefined) {
    await interaction.reply({
      content: `Sound "${soundName}" was not found.`,
      ephemeral: true,
    });
    return;
  }

  const volumeMultiplier = dependencies.soundConfigService.getSoundConfig(
    guildId,
    sound.name,
  ).volume;
  void dependencies.sessionManager
    .playSoundNow(guildId, sound.path, volumeMultiplier)
    .catch((error) => {
      logger.error(`Manual sound playback failed for "${soundName}".`, error);
    });
  await interaction.reply(`Playing **${sound.name}** now.`);
};

const autocompleteSoundName = async (
  interaction: AutocompleteInteraction,
  dependencies: CommandDependencies,
): Promise<void> => {
  const focusedValue = interaction.options.getFocused().trim().toLowerCase();
  const choices = dependencies.soundLibrary
    .getSounds()
    .map((sound) => sound.name)
    .filter((soundName, index, allNames) => {
      return allNames.indexOf(soundName) === index;
    })
    .sort((left, right) => left.localeCompare(right))
    .filter((soundName) => {
      return focusedValue === '' || soundName.toLowerCase().includes(focusedValue);
    })
    .slice(0, SOUND_NAME_AUTOCOMPLETE_LIMIT)
    .map((soundName) => ({
      name: soundName,
      value: soundName,
    }));

  await interaction.respond(choices);
};

export const createSoundsCommand = (
  dependencies: CommandDependencies,
): Command => {
  return {
    data: soundsCommandData,
    autocomplete: async (interaction: AutocompleteInteraction): Promise<void> => {
      await autocompleteSoundName(interaction, dependencies);
    },
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      const subcommandGroup = interaction.options.getSubcommandGroup(false);
      const subcommand = interaction.options.getSubcommand();

      if (subcommandGroup === 'config') {
        if (subcommand === 'view') {
          await viewSoundConfig(interaction, dependencies);
          return;
        }

        if (subcommand === 'volume') {
          const value = interaction.options.getNumber('value', true);
          if (value < 0 || value > 2) {
            await interaction.reply({
              content: 'Volume must be between 0.0 and 2.0.',
              ephemeral: true,
            });
            return;
          }

          await updateSoundConfig(interaction, dependencies, {
            fieldName: 'Volume',
            patch: { volume: value },
          });
          return;
        }

        if (subcommand === 'weight') {
          const value = interaction.options.getNumber('value', true);
          if (value < 0.1 || value > 10) {
            await interaction.reply({
              content: 'Weight must be between 0.1 and 10.0.',
              ephemeral: true,
            });
            return;
          }

          await updateSoundConfig(interaction, dependencies, {
            fieldName: 'Weight',
            patch: { weight: value },
          });
          return;
        }

        if (subcommand === 'interval') {
          const min = interaction.options.getInteger('min', true);
          const max = interaction.options.getInteger('max', true);
          if (min <= 0 || max < min) {
            await interaction.reply({
              content: 'Interval values must be greater than 0 and max must be at least min.',
              ephemeral: true,
            });
            return;
          }

          await updateSoundConfig(interaction, dependencies, {
            fieldName: 'Interval Override',
            patch: { minInterval: min, maxInterval: max },
          });
          return;
        }

        if (subcommand === 'interval-reset') {
          await updateSoundConfig(interaction, dependencies, {
            fieldName: 'Interval Override',
            patch: { minInterval: undefined, maxInterval: undefined },
          });
          return;
        }

        if (subcommand === 'enable') {
          await updateSoundConfig(interaction, dependencies, {
            fieldName: 'Enabled',
            patch: { enabled: true },
          });
          return;
        }

        if (subcommand === 'disable') {
          await updateSoundConfig(interaction, dependencies, {
            fieldName: 'Enabled',
            patch: { enabled: false },
          });
          return;
        }

        await resetSoundConfig(interaction, dependencies);
        return;
      }

      if (subcommand === 'list') {
        await listSounds(interaction, dependencies);
        return;
      }

      if (subcommand === 'add') {
        await addSound(interaction, dependencies);
        return;
      }

      if (subcommand === 'remove') {
        await removeSound(interaction, dependencies);
        return;
      }

      await playSound(interaction, dependencies);
    },
  };
};
