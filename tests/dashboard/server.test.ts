import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDashboardServer,
  DashboardServer,
} from '../../src/dashboard/server';
import { AudioPlayerService } from '../../src/services/audio-player';
import { ConfigService } from '../../src/services/config-service';
import { DensityCurveService } from '../../src/services/density-curve-service';
import { SessionManager } from '../../src/services/session-manager';
import { SoundConfigService } from '../../src/services/sound-config-service';
import { SoundLibrary } from '../../src/services/sound-library';
import { createTempDirectory, removeTempDirectory } from '../helpers/temp-directory';

const createChannelMock = (guildId: string, channelId: string) => {
  return {
    id: channelId,
    guild: {
      id: guildId,
      voiceAdapterCreator: {},
    },
  };
};

describe('dashboard server', () => {
  let tempDirectory = '';
  let soundsDirectory = '';
  let configService: ConfigService;
  let densityCurveService: DensityCurveService;
  let sessionManager: SessionManager;
  let soundConfigService: SoundConfigService;
  let soundLibrary: SoundLibrary;
  let dashboardServer: DashboardServer;
  let audioPlayerServiceMock: {
    joinChannel: ReturnType<typeof vi.fn>;
    leaveChannel: ReturnType<typeof vi.fn>;
    registerGuildAudioPlayer: ReturnType<typeof vi.fn>;
    playSound: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    tempDirectory = await createTempDirectory('dashboard-server-test');
    soundsDirectory = path.join(tempDirectory, 'sounds');
    await mkdir(soundsDirectory, { recursive: true });
    await writeFile(path.join(soundsDirectory, 'thunder.mp3'), Buffer.from('a'));

    soundLibrary = new SoundLibrary(soundsDirectory);
    await soundLibrary.waitForInitialScan();

    configService = new ConfigService(tempDirectory);
    densityCurveService = new DensityCurveService(tempDirectory);
    soundConfigService = new SoundConfigService(tempDirectory);
    audioPlayerServiceMock = {
      joinChannel: vi.fn().mockResolvedValue({}),
      leaveChannel: vi.fn(),
      registerGuildAudioPlayer: vi.fn(),
      playSound: vi.fn().mockResolvedValue(undefined),
    };
    sessionManager = new SessionManager(
      audioPlayerServiceMock as unknown as AudioPlayerService,
      soundLibrary,
      soundConfigService,
      densityCurveService,
    );
    await sessionManager.createSession(
      'guild-1',
      createChannelMock('guild-1', 'voice-1') as never,
      configService.getConfig('guild-1'),
    );

    dashboardServer = createDashboardServer({
      configService,
      densityCurveService,
      sessionManager,
      soundConfigService,
      soundLibrary,
    });
  });

  afterEach(async () => {
    sessionManager.destroyAllSessions();
    dashboardServer.close();
    densityCurveService.close();
    await removeTempDirectory(tempDirectory);
    vi.restoreAllMocks();
  });

  it('returns sound library data with config and playback metadata', async () => {
    const response = await request(dashboardServer.app).get('/api/sounds');

    expect(response.status).toBe(200);
    expect(response.body.sounds).toEqual([
      {
        name: 'thunder',
        path: path.join(soundsDirectory, 'thunder.mp3'),
        category: 'default',
        config: {
          volume: 1,
          weight: 1,
          enabled: true,
        },
        lastPlayed: null,
      },
    ]);
  });

  it('updates guild config through the api and applies it to the session', async () => {
    const response = await request(dashboardServer.app).patch('/api/config').send({
      minInterval: 45,
      maxInterval: 90,
      volume: 0.75,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      minInterval: 45,
      maxInterval: 90,
      volume: 0.75,
    });
    expect(sessionManager.getSession('guild-1')?.config).toEqual(response.body);
  });

  it('updates sound config and plays sounds through the api', async () => {
    const patchResponse = await request(dashboardServer.app)
      .patch('/api/sounds/thunder')
      .send({
        volume: 1.4,
        weight: 0.5,
        enabled: true,
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toEqual({
      name: 'thunder',
      config: {
        volume: 1.4,
        weight: 0.5,
        enabled: true,
      },
    });

    const playResponse = await request(dashboardServer.app).post(
      '/api/sounds/thunder/play',
    );

    expect(playResponse.status).toBe(204);
    expect(audioPlayerServiceMock.playSound).toHaveBeenCalledWith(
      'guild-1',
      path.join(soundsDirectory, 'thunder.mp3'),
      0.5,
      1.4,
    );
  });

  it('reads and updates density curves through the api', async () => {
    const getResponse = await request(dashboardServer.app).get('/api/density-curve');

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.preset).toBe('ambient');

    const putResponse = await request(dashboardServer.app)
      .put('/api/density-curve')
      .send({
        points: [
          { t: 0, d: 0.2 },
          { t: 30, d: 1.5 },
          { t: 120, d: 0.4 },
        ],
      });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body.points).toEqual([
      { t: 0, d: 0.2 },
      { t: 30, d: 1.5 },
      { t: 120, d: 0.4 },
    ]);

    const presetResponse = await request(dashboardServer.app)
      .post('/api/density-curve/preset')
      .send({ preset: 'sparse' });

    expect(presetResponse.status).toBe(200);
    expect(presetResponse.body.preset).toBe('sparse');
  });

  it('exposes session state and start stop controls', async () => {
    const initialResponse = await request(dashboardServer.app).get('/api/session');

    expect(initialResponse.status).toBe(200);
    expect(initialResponse.body).toMatchObject({
      active: true,
      guildId: 'guild-1',
      channelId: 'voice-1',
      isPlaying: false,
    });

    const startResponse = await request(dashboardServer.app).post('/api/session/start');
    expect(startResponse.status).toBe(204);
    expect(sessionManager.getSession('guild-1')?.isPlaying).toBe(true);

    const stopResponse = await request(dashboardServer.app).post('/api/session/stop');
    expect(stopResponse.status).toBe(204);
    expect(sessionManager.getSession('guild-1')?.isPlaying).toBe(false);
  });

  it('fails mutating requests clearly when no active session exists', async () => {
    sessionManager.destroySession('guild-1');

    const configResponse = await request(dashboardServer.app).get('/api/config');
    expect(configResponse.status).toBe(200);
    expect(configResponse.body).toEqual(configService.getDefaultConfig());

    const patchResponse = await request(dashboardServer.app).patch('/api/config').send({
      volume: 0.25,
    });

    expect(patchResponse.status).toBe(409);
    expect(patchResponse.body).toEqual({
      error: 'No active guild session is available for dashboard control.',
    });
  });
});
