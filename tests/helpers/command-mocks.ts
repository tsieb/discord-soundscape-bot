import { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import type {
  Attachment,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { vi } from 'vitest';
import { CommandDependencies } from '../../src/commands/types';
import { Scheduler } from '../../src/services/scheduler';
import { GuildConfig, Session, SoundConfig, SoundFile } from '../../src/types';

const DEFAULT_CONFIG: GuildConfig = {
  minInterval: 30,
  maxInterval: 300,
  volume: 0.5,
};

export interface InteractionMockOptions {
  guildId?: string | null;
  commandName?: string;
  subcommandGroup?: string | null;
  subcommand?: string;
  strings?: Record<string, string | null>;
  integers?: Record<string, number | null>;
  numbers?: Record<string, number | null>;
  attachments?: Record<string, Attachment | null>;
  replied?: boolean;
  deferred?: boolean;
  appPermissionsHas?: (permission: bigint) => boolean;
  guild?: unknown;
  userId?: string;
}

export interface InteractionMockResult {
  interaction: ChatInputCommandInteraction;
  reply: ReturnType<typeof vi.fn>;
  followUp: ReturnType<typeof vi.fn>;
}

export const createInteractionMock = (
  options: InteractionMockOptions = {},
): InteractionMockResult => {
  const reply = vi.fn().mockResolvedValue(undefined);
  const followUp = vi.fn().mockResolvedValue(undefined);
  const optionsMock = {
    getSubcommand: vi
      .fn<() => string>()
      .mockReturnValue(options.subcommand ?? 'view'),
    getSubcommandGroup: vi
      .fn<() => string | null>()
      .mockReturnValue(options.subcommandGroup ?? null),
    getInteger: vi
      .fn<(name: string) => number | null>()
      .mockImplementation((name: string) => {
        return options.integers?.[name] ?? null;
      }),
    getNumber: vi
      .fn<(name: string) => number | null>()
      .mockImplementation((name: string) => {
        return options.numbers?.[name] ?? null;
      }),
    getString: vi
      .fn<(name: string) => string | null>()
      .mockImplementation((name: string) => {
        return options.strings?.[name] ?? null;
      }),
    getAttachment: vi
      .fn<(name: string) => Attachment | null>()
      .mockImplementation((name: string) => {
        return options.attachments?.[name] ?? null;
      }),
  };

  const interaction = {
    guildId: options.guildId === undefined ? 'guild-1' : options.guildId,
    guild: options.guild ?? null,
    user: {
      id: options.userId ?? 'user-1',
    },
    commandName: options.commandName ?? 'test',
    appPermissions:
      options.appPermissionsHas === undefined
        ? null
        : {
            has: options.appPermissionsHas,
          },
    options: optionsMock,
    reply,
    followUp,
    replied: options.replied ?? false,
    deferred: options.deferred ?? false,
  } as unknown as ChatInputCommandInteraction;

  return {
    interaction,
    reply,
    followUp,
  };
};

export interface CommandDependenciesMock {
  dependencies: CommandDependencies;
  configService: {
    getConfig: ReturnType<typeof vi.fn>;
    setConfig: ReturnType<typeof vi.fn>;
    resetConfig: ReturnType<typeof vi.fn>;
  };
  sessionManager: {
    applySoundConfig: ReturnType<typeof vi.fn>;
    createSession: ReturnType<typeof vi.fn>;
    destroySession: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    getEarliestNextPlayTime: ReturnType<typeof vi.fn>;
    getSoundTimerCount: ReturnType<typeof vi.fn>;
    hasSession: ReturnType<typeof vi.fn>;
    startPlayback: ReturnType<typeof vi.fn>;
    stopPlayback: ReturnType<typeof vi.fn>;
    syncAllSessionSoundSchedulers: ReturnType<typeof vi.fn>;
    updateSessionConfig: ReturnType<typeof vi.fn>;
    playSoundNow: ReturnType<typeof vi.fn>;
  };
  soundLibrary: {
    addSound: ReturnType<typeof vi.fn>;
    getSoundByName: ReturnType<typeof vi.fn>;
    getSoundCount: ReturnType<typeof vi.fn>;
    getSounds: ReturnType<typeof vi.fn>;
    isSupportedFileName: ReturnType<typeof vi.fn>;
    removeSound: ReturnType<typeof vi.fn>;
  };
  soundConfigService: {
    getAllSoundConfigs: ReturnType<typeof vi.fn>;
    getSoundConfig: ReturnType<typeof vi.fn>;
    resetSoundConfig: ReturnType<typeof vi.fn>;
    setSoundConfig: ReturnType<typeof vi.fn>;
  };
  densityCurveService: {
    applyPreset: ReturnType<typeof vi.fn>;
    getCurve: ReturnType<typeof vi.fn>;
    getPresetName: ReturnType<typeof vi.fn>;
    isUniformPreset: ReturnType<typeof vi.fn>;
  };
}

export const createCommandDependenciesMock = (): CommandDependenciesMock => {
  const configService = {
    getConfig: vi.fn<(guildId: string) => GuildConfig>().mockReturnValue({
      ...DEFAULT_CONFIG,
    }),
    setConfig: vi.fn<(guildId: string, partial: Partial<GuildConfig>) => void>(),
    resetConfig: vi.fn<(guildId: string) => GuildConfig>().mockReturnValue({
      ...DEFAULT_CONFIG,
    }),
  };

  const sessionManager = {
    applySoundConfig: vi.fn<(guildId: string, soundName: string) => void>(),
    createSession: vi.fn<() => Promise<Session>>(),
    destroySession: vi.fn<(guildId: string) => void>(),
    getSession: vi.fn<(guildId: string) => Session | undefined>(),
    getEarliestNextPlayTime: vi
      .fn<(guildId: string) => number | null>()
      .mockReturnValue(Date.now() + 30_000),
    getSoundTimerCount: vi.fn<(guildId: string) => number>().mockReturnValue(1),
    hasSession: vi.fn<(guildId: string) => boolean>().mockReturnValue(false),
    startPlayback: vi.fn<(guildId: string) => boolean>().mockReturnValue(true),
    stopPlayback: vi.fn<(guildId: string) => void>(),
    syncAllSessionSoundSchedulers: vi.fn<() => void>(),
    updateSessionConfig: vi.fn<(guildId: string, config: GuildConfig) => void>(),
    playSoundNow: vi.fn<(guildId: string, soundPath: string) => Promise<void>>(),
  };

  const soundLibrary = {
    addSound: vi.fn<
      (fileName: string, data: Buffer, category?: string) => Promise<SoundFile>
    >(),
    getSoundByName: vi.fn<(name: string) => SoundFile | undefined>(),
    getSoundCount: vi.fn<() => number>().mockReturnValue(3),
    getSounds: vi.fn<() => SoundFile[]>().mockReturnValue([]),
    isSupportedFileName: vi.fn<(fileName: string) => boolean>().mockReturnValue(true),
    removeSound: vi.fn<(name: string) => Promise<void>>(),
  };

  const soundConfigService = {
    getAllSoundConfigs: vi.fn<(guildId: string) => Map<string, SoundConfig>>().mockReturnValue(new Map()),
    getSoundConfig: vi.fn<(guildId: string, soundName: string) => SoundConfig>().mockReturnValue({
      volume: 1,
      weight: 1,
      enabled: true,
    }),
    resetSoundConfig: vi.fn<(guildId: string, soundName: string) => Promise<SoundConfig>>().mockResolvedValue({
      volume: 1,
      weight: 1,
      enabled: true,
    }),
    setSoundConfig: vi.fn<
      (guildId: string, soundName: string, partial: Partial<SoundConfig>) => Promise<SoundConfig>
    >().mockImplementation(async (_guildId: string, _soundName: string, partial: Partial<SoundConfig>) => {
      return {
        volume: partial.volume ?? 1,
        weight: partial.weight ?? 1,
        enabled: partial.enabled ?? true,
        minInterval: partial.minInterval,
        maxInterval: partial.maxInterval,
      };
    }),
  };

  const densityCurveService = {
    applyPreset: vi.fn<(guildId: string, presetName: string) => Promise<void>>().mockResolvedValue(undefined),
    getCurve: vi.fn<(guildId: string) => Array<{ t: number; d: number }>>().mockReturnValue([
      { t: 0, d: 0.2 },
      { t: 30, d: 0.8 },
      { t: 90, d: 1.4 },
      { t: 180, d: 0.6 },
    ]),
    getPresetName: vi.fn<(guildId: string) => string>().mockReturnValue('ambient'),
    isUniformPreset: vi.fn<(guildId: string) => boolean>().mockReturnValue(false),
  };

  return {
    dependencies: {
      configService: configService as unknown as CommandDependencies['configService'],
      densityCurveService:
        densityCurveService as unknown as CommandDependencies['densityCurveService'],
      sessionManager:
        sessionManager as unknown as CommandDependencies['sessionManager'],
      soundConfigService:
        soundConfigService as unknown as CommandDependencies['soundConfigService'],
      soundLibrary: soundLibrary as unknown as CommandDependencies['soundLibrary'],
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    configService,
    densityCurveService,
    sessionManager,
    soundConfigService,
    soundLibrary,
  };
};

export interface AutocompleteInteractionMockResult {
  interaction: AutocompleteInteraction;
  respond: ReturnType<typeof vi.fn>;
}

export const createAutocompleteInteractionMock = (
  options: Pick<
    InteractionMockOptions,
    'commandName' | 'strings' | 'subcommand' | 'subcommandGroup'
  > & {
    focused?: string;
  } = {},
): AutocompleteInteractionMockResult => {
  const respond = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    commandName: options.commandName ?? 'sounds',
    options: {
      getSubcommand: vi
        .fn<() => string>()
        .mockReturnValue(options.subcommand ?? 'view'),
      getSubcommandGroup: vi
        .fn<() => string | null>()
        .mockReturnValue(options.subcommandGroup ?? null),
      getFocused: vi.fn<() => string>().mockReturnValue(options.focused ?? ''),
    },
    respond,
  } as unknown as AutocompleteInteraction;

  return {
    interaction,
    respond,
  };
};

export const createSessionMock = (
  overrides: Partial<Session> = {},
): Session => {
  const scheduler = {
    start: vi.fn(),
    stop: vi.fn(),
    updateConfig: vi.fn(),
    getNextPlayTime: vi.fn().mockReturnValue(Date.now() + 30_000),
    isRunning: vi.fn().mockReturnValue(false),
  };
  const soundSchedulers = new Map<string, Scheduler>([
    ['/sounds/mock.mp3', scheduler as unknown as Scheduler],
  ]);

  return {
    guildId: 'guild-1',
    channelId: 'voice-1',
    voiceConnection: {} as VoiceConnection,
    audioPlayer: {
      stop: vi.fn(),
    } as unknown as AudioPlayer,
    soundSchedulers,
    config: {
      ...DEFAULT_CONFIG,
    },
    isPlaying: false,
    ...overrides,
  };
};
