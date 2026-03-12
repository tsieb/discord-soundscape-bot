import {
  Attachment,
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
import { Command, SoundFile } from '../types';
import { CommandDependencies } from './types';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const EMBED_DESCRIPTION_CHAR_LIMIT = 3800;

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
          .setRequired(true);
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

const getPaginatedDescriptions = (sounds: SoundFile[]): string[] => {
  const grouped = new Map<string, string[]>();

  for (const sound of sounds) {
    const existing = grouped.get(sound.category) ?? [];
    existing.push(sound.name);
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

const createListEmbed = (
  description: string,
  pageIndex: number,
  pageCount: number,
  totalCount: number,
  categoryFilter: string | null,
): EmbedBuilder => {
  const categoryLabel =
    categoryFilter === null ? 'all categories' : `category "${categoryFilter}"`;
  return new EmbedBuilder()
    .setTitle('Sound Library')
    .setDescription(description)
    .setFooter({
      text: `Total: ${totalCount} sounds in ${categoryLabel} - Page ${pageIndex + 1}/${pageCount}`,
    });
};

const listSounds = async (
  interaction: ChatInputCommandInteraction,
  dependencies: CommandDependencies,
): Promise<void> => {
  const category = interaction.options.getString('category');
  const sounds = getFilteredSounds(dependencies.soundLibrary.getSounds(), category);

  if (sounds.length === 0) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Sound Library')
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

  const pages = getPaginatedDescriptions(sounds);
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

  void dependencies.sessionManager.playSoundNow(guildId, sound.path).catch((error) => {
    logger.error(`Manual sound playback failed for "${soundName}".`, error);
  });
  await interaction.reply(`Playing **${sound.name}** now.`);
};

export const createSoundsCommand = (
  dependencies: CommandDependencies,
): Command => {
  return {
    data: soundsCommandData,
    execute: async (interaction: ChatInputCommandInteraction): Promise<void> => {
      if (interaction.guildId === null) {
        await interaction.reply({
          content: 'This command can only be used in a server.',
          ephemeral: true,
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

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
