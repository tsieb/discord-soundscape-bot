import { VoiceConnection } from '@discordjs/voice';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlaybackError } from '../../src/services/audio-player';
import { Scheduler } from '../../src/services/scheduler';
import {
  SessionManager,
  SessionNotFoundError,
} from '../../src/services/session-manager';
import { GuildConfig, SoundConfig } from '../../src/types';

vi.mock('@discordjs/voice', () => {
  return {
    createAudioPlayer: vi.fn(() => ({
      stop: vi.fn(),
    })),
  };
});

const BASE_CONFIG: GuildConfig = {
  minInterval: 1,
  maxInterval: 1,
  volume: 0.5,
};

const createChannelMock = (guildId: string, channelId: string) => {
  return {
    id: channelId,
    guild: {
      id: guildId,
      voiceAdapterCreator: {},
    },
  };
};

describe('SessionManager', () => {
  const createServiceMock = () => {
    return {
      joinChannel: vi.fn().mockResolvedValue({} as VoiceConnection),
      leaveChannel: vi.fn(),
      registerGuildAudioPlayer: vi.fn(),
      playSound: vi.fn().mockResolvedValue(undefined),
    };
  };

  const createSoundLibraryMock = (
    sounds: Array<{ name: string; path: string; category: string }>,
  ) => {
    return {
      getSounds: vi.fn().mockReturnValue(sounds),
      getSoundByName: vi.fn((name: string) => {
        return sounds.find((sound) => sound.name === name);
      }),
    };
  };

  const createSoundConfigServiceMock = (
    overrides: Record<string, Partial<SoundConfig>> = {},
  ) => {
    return {
      getSoundConfig: vi.fn((guildId: string, soundName: string) => {
        void guildId;
        const override = overrides[soundName];
        return {
          volume: override?.volume ?? 1,
          weight: override?.weight ?? 1,
          enabled: override?.enabled ?? true,
          minInterval: override?.minInterval,
          maxInterval: override?.maxInterval,
        };
      }),
    };
  };

  const createDensityCurveServiceMock = (
    options: {
      isUniformPreset?: boolean;
      sampleValue?: number;
    } = {},
  ) => {
    const listeners: Array<(guildId: string) => void> = [];

    return {
      sample: vi.fn<() => number>().mockImplementation(() => {
        return options.sampleValue ?? 1;
      }),
      isUniformPreset: vi
        .fn<(guildId: string) => boolean>()
        .mockImplementation(() => {
          return options.isUniformPreset ?? true;
        }),
      subscribe: vi
        .fn<(listener: (guildId: string) => void) => () => void>()
        .mockImplementation((listener: (guildId: string) => void) => {
          listeners.push(listener);
          return () => undefined;
        }),
      emitChange: (guildId: string) => {
        for (const listener of listeners) {
          listener(guildId);
        }
      },
    };
  };

  const createManager = (
    service: ReturnType<typeof createServiceMock>,
    soundLibrary: ReturnType<typeof createSoundLibraryMock>,
    soundConfigService: ReturnType<typeof createSoundConfigServiceMock>,
    densityCurveService = createDensityCurveServiceMock(),
  ) => {
    return {
      manager: new SessionManager(
        service as never,
        soundLibrary as never,
        soundConfigService as never,
        densityCurveService as never,
      ),
      densityCurveService,
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates and stores sessions', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);

    const session = await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    expect(service.joinChannel).toHaveBeenCalledTimes(1);
    expect(service.registerGuildAudioPlayer).toHaveBeenCalledWith(
      'guild-1',
      session.audioPlayer,
    );
    expect(session.soundSchedulers.size).toBe(0);
    expect(manager.hasSession('guild-1')).toBe(true);
    expect(manager.getSession('guild-1')).toBe(session);
  });

  it('replaces an existing session when creating again for the same guild', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);

    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-2') as never,
      BASE_CONFIG,
    );

    expect(service.leaveChannel).toHaveBeenCalledWith('guild-1');
    expect(manager.getSession('guild-1')?.channelId).toBe('voice-2');
  });

  it('starts and stops playback state', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([
      { name: 'beep', path: '/beep.mp3', category: 'default' },
    ]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    const started = manager.startPlayback('guild-1');
    expect(started).toBe(true);
    expect(manager.getSession('guild-1')?.isPlaying).toBe(true);
    expect(manager.getSoundTimerCount('guild-1')).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(service.playSound).toHaveBeenCalledWith(
      'guild-1',
      '/beep.mp3',
      0.5,
      1,
    );

    manager.stopPlayback('guild-1');
    expect(manager.getSession('guild-1')?.isPlaying).toBe(false);
  });

  it('does not start playback when no sounds are available', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    const started = manager.startPlayback('guild-1');

    expect(started).toBe(false);
    const session = manager.getSession('guild-1');
    expect(session?.isPlaying).toBe(false);
    expect(session?.soundSchedulers.size).toBe(0);
  });

  it('continues scheduling when playback throws AudioPlaybackError', async () => {
    const service = createServiceMock();
    service.playSound.mockRejectedValue(
      new AudioPlaybackError('cannot decode file'),
    );
    const soundLibrary = createSoundLibraryMock([
      {
        name: 'bad-file',
        path: '/bad.mp3',
        category: 'default',
      },
    ]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    manager.startPlayback('guild-1');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(service.playSound).toHaveBeenCalledTimes(2);
    expect(manager.getSession('guild-1')?.isPlaying).toBe(true);
  });

  it('serializes overlapping timers to avoid concurrent playback', async () => {
    const service = createServiceMock();
    let resolvePlayback: (() => void) | null = null;
    service.playSound.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePlayback = resolve;
        }),
    );
    const soundLibrary = createSoundLibraryMock([
      { name: 'a', path: '/a.mp3', category: 'default' },
      { name: 'b', path: '/b.mp3', category: 'default' },
    ]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    manager.startPlayback('guild-1');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(service.playSound).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(service.playSound).toHaveBeenCalledTimes(1);

    resolvePlayback?.();
    await vi.advanceTimersByTimeAsync(1_000);
    manager.stopPlayback('guild-1');

    expect(service.playSound).toHaveBeenCalledTimes(2);
  });

  it('updates active session config and scheduler interval', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([
      {
        name: 'beep',
        path: '/beep.mp3',
        category: 'default',
      },
    ]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    const session = manager.getSession('guild-1');
    if (session === undefined) {
      throw new Error('Expected session to be created');
    }
    const firstScheduler = session.soundSchedulers.values().next().value;
    if (firstScheduler === undefined) {
      throw new Error('Expected at least one scheduler');
    }
    const schedulerUpdateSpy = vi.spyOn(firstScheduler, 'updateConfig');

    manager.updateSessionConfig('guild-1', {
      minInterval: 5,
      maxInterval: 10,
      volume: 0.9,
    });

    expect(manager.getSession('guild-1')?.config).toEqual({
      minInterval: 5,
      maxInterval: 10,
      volume: 0.9,
    });
    expect(schedulerUpdateSpy).toHaveBeenCalledWith(5, 10, null);
  });

  it('syncs independent timers as sounds are added and removed', async () => {
    const service = createServiceMock();
    const sounds = [
      {
        name: 'beep',
        path: '/beep.mp3',
        category: 'default',
      },
    ];
    const soundLibrary = createSoundLibraryMock(sounds);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    manager.startPlayback('guild-1');
    expect(manager.getSoundTimerCount('guild-1')).toBe(1);

    sounds.push({
      name: 'boop',
      path: '/boop.mp3',
      category: 'default',
    });
    manager.syncAllSessionSoundSchedulers();
    expect(manager.getSoundTimerCount('guild-1')).toBe(2);

    sounds.length = 0;
    manager.syncAllSessionSoundSchedulers();
    expect(manager.getSoundTimerCount('guild-1')).toBe(0);
    expect(manager.getSession('guild-1')?.isPlaying).toBe(false);
  });

  it('plays manual sounds using session volume', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([
      {
        name: 'beep',
        path: '/beep.mp3',
        category: 'default',
      },
    ]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      {
        minInterval: 1,
        maxInterval: 1,
        volume: 0.8,
      },
    );

    await manager.playSoundNow('guild-1', '/manual.mp3');

    expect(service.playSound).toHaveBeenCalledWith(
      'guild-1',
      '/manual.mp3',
      0.8,
      1,
    );
  });

  it('handles bot voice move and disconnect state updates', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);
    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    manager.handleVoiceStateUpdate(
      {
        channelId: 'voice-1',
      } as never,
      {
        id: 'bot-user',
        guild: { id: 'guild-1' },
        client: { user: { id: 'bot-user' } },
        channelId: 'voice-2',
      } as never,
    );

    expect(manager.getSession('guild-1')?.channelId).toBe('voice-2');

    manager.handleVoiceStateUpdate(
      {
        channelId: 'voice-2',
      } as never,
      {
        id: 'bot-user',
        guild: { id: 'guild-1' },
        client: { user: { id: 'bot-user' } },
        channelId: null,
      } as never,
    );

    expect(manager.hasSession('guild-1')).toBe(false);
  });

  it('throws SessionNotFoundError for missing required sessions', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);

    expect(() => manager.startPlayback('missing')).toThrow(SessionNotFoundError);
    expect(() => manager.stopPlayback('missing')).toThrow(SessionNotFoundError);
    await expect(manager.playSoundNow('missing', '/x.mp3')).rejects.toThrow(
      SessionNotFoundError,
    );
  });

  it('destroys all sessions and clears resources', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);

    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );
    await manager.createSession(
      'guild-2',
      createChannelMock('guild-2', 'voice-2') as never,
      BASE_CONFIG,
    );

    manager.destroyAllSessions();

    expect(manager.hasSession('guild-1')).toBe(false);
    expect(manager.hasSession('guild-2')).toBe(false);
    expect(service.leaveChannel).toHaveBeenCalledTimes(2);
  });

  it('uses Scheduler for per-sound timing', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([
      {
        name: 'bad-file',
        path: '/bad.mp3',
        category: 'default',
      },
    ]);
    const soundConfigService = createSoundConfigServiceMock();
    const { manager } = createManager(service, soundLibrary, soundConfigService);

    const session = await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    expect(session.soundSchedulers.size).toBe(1);
    for (const scheduler of session.soundSchedulers.values()) {
      expect(scheduler).toBeInstanceOf(Scheduler);
    }
  });

  it('applies per-sound weights and interval overrides to scheduler timing', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([
      {
        name: 'thunder',
        path: '/thunder.mp3',
        category: 'default',
      },
    ]);
    const soundConfigService = createSoundConfigServiceMock({
      thunder: {
        weight: 0.5,
        minInterval: 10,
        maxInterval: 20,
      },
    });
    const { manager } = createManager(service, soundLibrary, soundConfigService);

    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    const session = manager.getSession('guild-1');
    if (session === undefined) {
      throw new Error('Expected session to be created');
    }

    const scheduler = session.soundSchedulers.get('/thunder.mp3');
    if (scheduler === undefined) {
      throw new Error('Expected thunder scheduler');
    }

    const updateSpy = vi.spyOn(scheduler, 'updateConfig');
    manager.syncAllSessionSoundSchedulers();

    expect(updateSpy).toHaveBeenCalledWith(20, 40, null);
  });

  it('removes disabled sounds from active timers and restores them when re-enabled', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([
      { name: 'beep', path: '/beep.mp3', category: 'default' },
    ]);
    const soundConfigOverrides: Record<string, Partial<SoundConfig>> = {
      beep: {
        enabled: false,
      },
    };
    const soundConfigService = createSoundConfigServiceMock(soundConfigOverrides);
    const { manager } = createManager(service, soundLibrary, soundConfigService);

    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    expect(manager.getSoundTimerCount('guild-1')).toBe(0);

    soundConfigOverrides.beep = { enabled: true };
    manager.applySoundConfig('guild-1', 'beep');

    expect(manager.getSoundTimerCount('guild-1')).toBe(1);
  });

  it('uses per-sound volume multipliers for scheduled playback', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([
      { name: 'beep', path: '/beep.mp3', category: 'default' },
    ]);
    const soundConfigService = createSoundConfigServiceMock({
      beep: {
        volume: 1.4,
      },
    });
    const { manager } = createManager(service, soundLibrary, soundConfigService);

    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      BASE_CONFIG,
    );

    manager.startPlayback('guild-1');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(service.playSound).toHaveBeenCalledWith(
      'guild-1',
      '/beep.mp3',
      0.5,
      1.4,
    );
  });

  it('updates active schedulers when the density curve changes live', async () => {
    const service = createServiceMock();
    const soundLibrary = createSoundLibraryMock([
      { name: 'beep', path: '/beep.mp3', category: 'default' },
    ]);
    const soundConfigService = createSoundConfigServiceMock();
    const densityCurveService = createDensityCurveServiceMock({
      isUniformPreset: false,
      sampleValue: 3,
    });
    const { manager } = createManager(
      service,
      soundLibrary,
      soundConfigService,
      densityCurveService,
    );

    await manager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      {
        minInterval: 1,
        maxInterval: 5,
        volume: 0.5,
      },
    );

    const session = manager.getSession('guild-1');
    if (session === undefined) {
      throw new Error('Expected session to be created');
    }

    const scheduler = session.soundSchedulers.get('/beep.mp3');
    if (scheduler === undefined) {
      throw new Error('Expected beep scheduler');
    }

    const updateSpy = vi.spyOn(scheduler, 'updateConfig');
    densityCurveService.emitChange('guild-1');

    expect(updateSpy).toHaveBeenCalledWith(1, 5, expect.any(Function));
  });
});
