import { Attachment } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSoundsCommand } from '../../src/commands/sounds';
import {
  InvalidSoundCategoryError,
  SoundNotFoundError,
  UnsupportedSoundFormatError,
} from '../../src/services/sound-library';
import {
  createAutocompleteInteractionMock,
  createCommandDependenciesMock,
  createInteractionMock,
  createSessionMock,
} from '../helpers/command-mocks';

const createAttachment = (
  overrides: Partial<Attachment> = {},
): Attachment => {
  return {
    name: 'beep.mp3',
    size: 512,
    url: 'https://example.test/beep.mp3',
    ...overrides,
  } as Attachment;
};

describe('sounds command', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects usage outside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ guildId: null });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
  });

  it('lists no sounds as an ephemeral embed', async () => {
    const { dependencies, soundLibrary } = createCommandDependenciesMock();
    soundLibrary.getSounds.mockReturnValue([]);

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ subcommand: 'list' });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      embeds: [expect.anything()],
      ephemeral: true,
    });
  });

  it('lists sounds filtered by category', async () => {
    const { dependencies, soundLibrary } = createCommandDependenciesMock();
    soundLibrary.getSounds.mockReturnValue([
      { name: 'alpha', path: '/a/alpha.mp3', category: 'music' },
      { name: 'beta', path: '/a/beta.mp3', category: 'fx' },
    ]);

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'list',
      strings: { category: 'music' },
    });

    await command.execute(interaction);

    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { description: string; footer: { text: string } } }> }];
    expect(payload.embeds[0].data.description).toContain('alpha');
    expect(payload.embeds[0].data.description).not.toContain('beta');
    expect(payload.embeds[0].data.footer.text).toContain('Total: 1 sounds');
  });

  it('paginates long sound listings', async () => {
    const { dependencies, soundLibrary } = createCommandDependenciesMock();
    soundLibrary.getSounds.mockReturnValue(
      Array.from({ length: 350 }, (_, index) => {
        return {
          name: `sound-${index.toString().padStart(3, '0')}-long-name`,
          path: `/sounds/sound-${index}.mp3`,
          category: 'bulk',
        };
      }),
    );

    const command = createSoundsCommand(dependencies);
    const { interaction, reply, followUp } = createInteractionMock({
      subcommand: 'list',
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledTimes(1);
    expect(followUp).toHaveBeenCalled();
  });

  it('validates add attachment filename', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'add',
      attachments: { file: createAttachment({ name: null }) },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'The uploaded file must have a filename.',
      ephemeral: true,
    });
  });

  it('validates add attachment extension', async () => {
    const { dependencies, soundLibrary } = createCommandDependenciesMock();
    soundLibrary.isSupportedFileName.mockReturnValue(false);

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'add',
      attachments: { file: createAttachment({ name: 'bad.txt' }) },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: expect.stringContaining('Unsupported file type.'),
      ephemeral: true,
    });
  });

  it('validates add attachment size', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'add',
      attachments: { file: createAttachment({ size: 11 * 1024 * 1024 }) },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'File is too large. Maximum upload size is 10 MB.',
      ephemeral: true,
    });
  });

  it('handles unsupported format errors from sound library', async () => {
    const { dependencies, soundLibrary } = createCommandDependenciesMock();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      }),
    );
    soundLibrary.addSound.mockRejectedValue(
      new UnsupportedSoundFormatError('bad.raw'),
    );

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'add',
      attachments: { file: createAttachment() },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: expect.stringContaining('Unsupported sound format'),
      ephemeral: true,
    });
  });

  it('handles invalid category errors from sound library', async () => {
    const { dependencies, soundLibrary } = createCommandDependenciesMock();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1]).buffer),
      }),
    );
    soundLibrary.addSound.mockRejectedValue(new InvalidSoundCategoryError('???'));

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'add',
      attachments: { file: createAttachment() },
      strings: { category: '???' },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'Invalid sound category "???".',
      ephemeral: true,
    });
  });

  it('adds uploaded sounds', async () => {
    const { dependencies, soundLibrary, sessionManager } =
      createCommandDependenciesMock();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([9, 8]).buffer),
      }),
    );
    soundLibrary.addSound.mockResolvedValue({
      name: 'beep',
      path: '/sounds/beep.mp3',
      category: 'default',
    });

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'add',
      attachments: { file: createAttachment() },
      strings: { category: 'fx' },
    });

    await command.execute(interaction);

    expect(soundLibrary.addSound).toHaveBeenCalledWith(
      'beep.mp3',
      expect.any(Buffer),
      'fx',
    );
    expect(sessionManager.syncAllSessionSoundSchedulers).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('Added **beep** to the library.');
  });

  it('reports remove errors for missing sound names', async () => {
    const { dependencies, soundLibrary } = createCommandDependenciesMock();
    soundLibrary.removeSound.mockRejectedValue(new SoundNotFoundError('ghost'));

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'remove',
      strings: { name: 'ghost' },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'Sound "ghost" was not found.',
      ephemeral: true,
    });
  });

  it('removes sounds by name', async () => {
    const { dependencies, soundLibrary, sessionManager } =
      createCommandDependenciesMock();
    soundLibrary.removeSound.mockResolvedValue();

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'remove',
      strings: { name: 'beep' },
    });

    await command.execute(interaction);

    expect(soundLibrary.removeSound).toHaveBeenCalledWith('beep');
    expect(sessionManager.syncAllSessionSoundSchedulers).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('Removed **beep** from the library.');
  });

  it('requires an active session to play sounds now', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(undefined);

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'play',
      strings: { name: 'beep' },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'I am not connected to voice in this server. Use `/join` first.',
      ephemeral: true,
    });
  });

  it('requires requested sound to exist for manual play', async () => {
    const { dependencies, sessionManager, soundLibrary } =
      createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(createSessionMock());
    soundLibrary.getSoundByName.mockReturnValue(undefined);

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'play',
      strings: { name: 'ghost' },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'Sound "ghost" was not found.',
      ephemeral: true,
    });
  });

  it('plays a requested sound immediately', async () => {
    const { dependencies, sessionManager, soundLibrary, soundConfigService } =
      createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(createSessionMock());
    sessionManager.playSoundNow.mockResolvedValue();
    soundLibrary.getSoundByName.mockReturnValue({
      name: 'beep',
      path: '/sounds/beep.mp3',
      category: 'default',
    });
    soundConfigService.getSoundConfig.mockReturnValue({
      volume: 1.4,
      weight: 1,
      enabled: true,
    });

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'play',
      strings: { name: 'beep' },
    });

    await command.execute(interaction);

    expect(sessionManager.playSoundNow).toHaveBeenCalledWith(
      'guild-1',
      '/sounds/beep.mp3',
      1.4,
    );
    expect(reply).toHaveBeenCalledWith('Playing **beep** now.');
  });

  it('shows a single sound config view', async () => {
    const { dependencies, soundLibrary, soundConfigService } =
      createCommandDependenciesMock();
    soundLibrary.getSoundByName.mockReturnValue({
      name: 'thunder',
      path: '/sounds/thunder.mp3',
      category: 'weather',
    });
    soundConfigService.getSoundConfig.mockReturnValue({
      volume: 1.4,
      weight: 0.2,
      enabled: true,
      minInterval: 180,
      maxInterval: 600,
    });

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommandGroup: 'config',
      subcommand: 'view',
      strings: { sound: 'thunder' },
    });

    await command.execute(interaction);

    const [payload] = reply.mock.calls[0] as [
      { embeds: Array<{ data: { title: string; fields: Array<{ name: string; value: string }> } }> },
    ];
    expect(payload.embeds[0].data.title).toContain('thunder');
    expect(payload.embeds[0].data.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Interval Override',
          value: expect.stringContaining('180s - 600s'),
        }),
      ]),
    );
  });

  it('shows an overview for all sound configs', async () => {
    const { dependencies, soundLibrary, soundConfigService } =
      createCommandDependenciesMock();
    soundLibrary.getSounds.mockReturnValue([
      { name: 'rain', path: '/sounds/rain.mp3', category: 'weather' },
      { name: 'thunder', path: '/sounds/thunder.mp3', category: 'weather' },
    ]);
    soundConfigService.getSoundConfig.mockImplementation(
      (_guildId: string, soundName: string) => {
        if (soundName === 'thunder') {
          return {
            volume: 1.4,
            weight: 0.2,
            enabled: true,
            minInterval: 180,
            maxInterval: 600,
          };
        }

        return {
          volume: 1,
          weight: 1,
          enabled: true,
        };
      },
    );

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommandGroup: 'config',
      subcommand: 'view',
    });

    await command.execute(interaction);

    const [payload] = reply.mock.calls[0] as [
      { embeds: Array<{ data: { description: string } }> },
    ];
    expect(payload.embeds[0].data.description).toContain('thunder');
    expect(payload.embeds[0].data.description).toContain('140%');
  });

  it('updates per-sound volume with a confirmation embed', async () => {
    const { dependencies, soundLibrary, soundConfigService, sessionManager } =
      createCommandDependenciesMock();
    soundLibrary.getSoundByName.mockReturnValue({
      name: 'beep',
      path: '/sounds/beep.mp3',
      category: 'default',
    });
    soundConfigService.getSoundConfig.mockReturnValue({
      volume: 1,
      weight: 1,
      enabled: true,
    });
    soundConfigService.setSoundConfig.mockResolvedValue({
      volume: 1.6,
      weight: 1,
      enabled: true,
    });

    const command = createSoundsCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommandGroup: 'config',
      subcommand: 'volume',
      strings: { sound: 'beep' },
      numbers: { value: 1.6 },
    });

    await command.execute(interaction);

    expect(soundConfigService.setSoundConfig).toHaveBeenCalledWith(
      'guild-1',
      'beep',
      { volume: 1.6 },
    );
    expect(sessionManager.applySoundConfig).toHaveBeenCalledWith(
      'guild-1',
      'beep',
    );
    expect(reply).toHaveBeenCalledWith({
      embeds: [expect.anything()],
    });
  });

  it('resets interval overrides without clearing other sound settings', async () => {
    const { dependencies, soundLibrary, soundConfigService, sessionManager } =
      createCommandDependenciesMock();
    soundLibrary.getSoundByName.mockReturnValue({
      name: 'beep',
      path: '/sounds/beep.mp3',
      category: 'default',
    });
    soundConfigService.getSoundConfig.mockReturnValue({
      volume: 1,
      weight: 2,
      enabled: true,
      minInterval: 30,
      maxInterval: 60,
    });
    soundConfigService.setSoundConfig.mockResolvedValue({
      volume: 1,
      weight: 2,
      enabled: true,
    });

    const command = createSoundsCommand(dependencies);
    const { interaction } = createInteractionMock({
      subcommandGroup: 'config',
      subcommand: 'interval-reset',
      strings: { sound: 'beep' },
    });

    await command.execute(interaction);

    expect(soundConfigService.setSoundConfig).toHaveBeenCalledWith(
      'guild-1',
      'beep',
      { minInterval: undefined, maxInterval: undefined },
    );
    expect(sessionManager.applySoundConfig).toHaveBeenCalledWith(
      'guild-1',
      'beep',
    );
  });

  it('autocompletes sound names for config subcommands', async () => {
    const { dependencies, soundLibrary } = createCommandDependenciesMock();
    soundLibrary.getSounds.mockReturnValue([
      { name: 'Thunderclap', path: '/sounds/thunder.mp3', category: 'weather' },
      { name: 'Rainstorm', path: '/sounds/rain.mp3', category: 'weather' },
      { name: 'Crickets', path: '/sounds/crickets.mp3', category: 'night' },
    ]);

    const command = createSoundsCommand(dependencies);
    const { interaction, respond } = createAutocompleteInteractionMock({
      commandName: 'sounds',
      subcommandGroup: 'config',
      subcommand: 'view',
      focused: 'th',
    });

    await command.autocomplete?.(interaction);

    expect(respond).toHaveBeenCalledWith([
      {
        name: 'Thunderclap',
        value: 'Thunderclap',
      },
    ]);
  });
});
