import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockAudioPlayer extends EventEmitter {
  readonly play: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
}

interface MockVoiceConnection extends EventEmitter {
  readonly joinConfig: { channelId: string };
  readonly subscribe: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
  state: { status: string };
}

interface VoiceMockState {
  readonly createdPlayers: MockAudioPlayer[];
  readonly createdConnections: MockVoiceConnection[];
  readonly entersStateMock: ReturnType<typeof vi.fn>;
  readonly createAudioResourceMock: ReturnType<typeof vi.fn>;
}

interface AudioPlayerModule {
  AudioPlayerService: typeof import('../../src/services/audio-player').AudioPlayerService;
  AudioPlaybackError: typeof import('../../src/services/audio-player').AudioPlaybackError;
  VoiceConnectionError: typeof import('../../src/services/audio-player').VoiceConnectionError;
}

const loadAudioPlayerModule = async (): Promise<{
  state: VoiceMockState;
  module: AudioPlayerModule;
}> => {
  vi.resetModules();

  const state: VoiceMockState = {
    createdPlayers: [],
    createdConnections: [],
    entersStateMock: vi.fn().mockResolvedValue(undefined),
    createAudioResourceMock: vi.fn(() => {
      return {
        volume: {
          setVolume: vi.fn(),
        },
      };
    }),
  };

  vi.doMock('@discordjs/voice', () => {
    class LocalMockAudioPlayer extends EventEmitter {
      public readonly play = vi.fn();

      public readonly stop = vi.fn();
    }

    class LocalMockVoiceConnection extends EventEmitter {
      public readonly joinConfig: { channelId: string };

      public state = {
        status: 'ready',
      };

      public readonly subscribe = vi.fn();

      public readonly destroy = vi.fn(() => {
        this.state.status = 'destroyed';
      });

      constructor(channelId: string) {
        super();
        this.joinConfig = { channelId };
      }
    }

    return {
      AudioPlayerStatus: {
        Playing: 'playing',
        Idle: 'idle',
        AutoPaused: 'autopaused',
      },
      VoiceConnectionStatus: {
        Ready: 'ready',
        Disconnected: 'disconnected',
        Destroyed: 'destroyed',
        Signalling: 'signalling',
        Connecting: 'connecting',
      },
      createAudioPlayer: vi.fn(() => {
        const player = new LocalMockAudioPlayer();
        state.createdPlayers.push(player as unknown as MockAudioPlayer);
        return player;
      }),
      createAudioResource: state.createAudioResourceMock,
      entersState: state.entersStateMock,
      joinVoiceChannel: vi.fn((options: { channelId: string }) => {
        const connection = new LocalMockVoiceConnection(options.channelId);
        state.createdConnections.push(connection as unknown as MockVoiceConnection);
        return connection;
      }),
    };
  });

  const imported = await import('../../src/services/audio-player');

  return {
    state,
    module: {
      AudioPlayerService: imported.AudioPlayerService,
      AudioPlaybackError: imported.AudioPlaybackError,
      VoiceConnectionError: imported.VoiceConnectionError,
    },
  };
};

describe('AudioPlayerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('joins a new channel and returns the ready connection', async () => {
    const { state, module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService();

    const connection = await service.joinChannel({
      id: 'voice-1',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);

    expect(connection).toBe(state.createdConnections[0]);
    expect(state.entersStateMock).toHaveBeenCalled();
    expect(service.getConnection('guild-1')).toBe(connection);
  });

  it('reuses existing connection when joining same channel', async () => {
    const { state, module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService();

    const first = await service.joinChannel({
      id: 'voice-1',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);
    const second = await service.joinChannel({
      id: 'voice-1',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);

    expect(first).toBe(second);
    expect(state.createdConnections).toHaveLength(1);
  });

  it('moves connection when joining a different channel in same guild', async () => {
    const { state, module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService();

    await service.joinChannel({
      id: 'voice-1',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);

    const moved = await service.joinChannel({
      id: 'voice-2',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);

    expect(state.createdConnections).toHaveLength(2);
    expect(state.createdConnections[0].destroy).toHaveBeenCalled();
    expect(moved).toBe(state.createdConnections[1]);
  });

  it('throws VoiceConnectionError when ready state cannot be reached', async () => {
    const { state, module } = await loadAudioPlayerModule();
    state.entersStateMock.mockRejectedValueOnce(new Error('timeout'));
    const service = new module.AudioPlayerService();

    await expect(
      service.joinChannel({
        id: 'voice-1',
        guild: { id: 'guild-1', voiceAdapterCreator: {} },
      } as never),
    ).rejects.toThrow(module.VoiceConnectionError);
  });

  it('safely ignores leave when no connection exists', async () => {
    const { module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService();

    expect(() => service.leaveChannel('missing')).not.toThrow();
  });

  it('plays sound through the guild player and resolves on idle', async () => {
    const { state, module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService();
    await service.joinChannel({
      id: 'voice-1',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);

    const playPromise = service.playSound('guild-1', '/sound.mp3', 0.6);
    state.createdPlayers[0].emit('idle');

    await expect(playPromise).resolves.toBeUndefined();
    expect(state.createdConnections[0].subscribe).toHaveBeenCalledWith(
      state.createdPlayers[0],
    );
    expect(state.createdPlayers[0].play).toHaveBeenCalledTimes(1);
    expect(
      state.createAudioResourceMock.mock.results[0]?.value.volume.setVolume,
    ).toHaveBeenCalledWith(0.6);
  });

  it('applies an optional per-sound volume multiplier during playback', async () => {
    const { state, module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService();
    await service.joinChannel({
      id: 'voice-1',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);

    const playPromise = service.playSound('guild-1', '/sound.mp3', 0.5, 1.4);
    state.createdPlayers[0].emit('idle');

    await expect(playPromise).resolves.toBeUndefined();
    expect(
      state.createAudioResourceMock.mock.results[0]?.value.volume.setVolume,
    ).toHaveBeenCalledWith(0.7);
  });

  it('rejects playback when guild has no active connection', async () => {
    const { module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService();

    await expect(service.playSound('missing', '/sound.mp3', 1)).rejects.toThrow(
      module.AudioPlaybackError,
    );
  });

  it('rejects playback when player emits error', async () => {
    const { state, module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService();
    await service.joinChannel({
      id: 'voice-1',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);

    const playPromise = service.playSound('guild-1', '/sound.mp3', 0.3);
    state.createdPlayers[0].emit('error', new Error('decode failed'));

    await expect(playPromise).rejects.toThrow(module.AudioPlaybackError);
  });

  it('auto disconnects when bot is alone and feature is enabled', async () => {
    const { module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService({ autoDisconnectWhenAlone: true });

    const channel = {
      id: 'voice-1',
      members: {
        filter: (predicate: (member: { user: { bot: boolean } }) => boolean) => {
          const members = [{ user: { bot: true } }];
          return {
            size: members.filter(predicate).length,
          };
        },
      },
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    };

    await service.joinChannel(channel as never);
    const leaveSpy = vi.spyOn(service, 'leaveChannel');

    service.handleVoiceStateUpdate(
      {
        guild: { id: 'guild-1' },
        channelId: 'voice-1',
        id: 'member-1',
        client: { user: { id: 'bot-user' } },
      } as never,
      {
        guild: { id: 'guild-1' },
        channelId: null,
        id: 'member-1',
        client: { user: { id: 'bot-user' } },
      } as never,
    );

    expect(leaveSpy).toHaveBeenCalledWith('guild-1');
  });

  it('attempts reconnection after disconnection and cleans up on repeated failure', async () => {
    const { state, module } = await loadAudioPlayerModule();
    const service = new module.AudioPlayerService({
      reconnectTimeoutMs: 50,
      initialReconnectDelayMs: 10,
      maxReconnectAttempts: 2,
    });

    state.entersStateMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('retry-1'))
      .mockRejectedValueOnce(new Error('retry-1'))
      .mockRejectedValueOnce(new Error('retry-1'))
      .mockRejectedValueOnce(new Error('retry-2'))
      .mockRejectedValueOnce(new Error('retry-2'))
      .mockRejectedValueOnce(new Error('retry-2'));

    await service.joinChannel({
      id: 'voice-1',
      guild: { id: 'guild-1', voiceAdapterCreator: {} },
    } as never);

    state.createdConnections[0].emit('disconnected');
    await vi.advanceTimersByTimeAsync(30);

    expect(state.createdConnections[0].destroy).toHaveBeenCalled();
    expect(service.getConnection('guild-1')).toBeUndefined();
  });
});
