import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCommands } from '../../src/commands';
import { ConfigService } from '../../src/services/config-service';
import { DensityCurveService } from '../../src/services/density-curve-service';
import { SessionManager } from '../../src/services/session-manager';
import { SoundConfigService } from '../../src/services/sound-config-service';
import { SoundLibrary } from '../../src/services/sound-library';
import {
  createInteractionMock,
  createSessionMock,
} from '../helpers/command-mocks';
import {
  createTempDirectory,
  removeTempDirectory,
} from '../helpers/temp-directory';

describe('application smoke', () => {
  const tempDirectories: string[] = [];
  const densityCurveServices: DensityCurveService[] = [];

  afterEach(async () => {
    while (densityCurveServices.length > 0) {
      densityCurveServices.pop()?.close();
    }
    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop();
      if (directory !== undefined) {
        await removeTempDirectory(directory);
      }
    }
    vi.restoreAllMocks();
  });

  it('wires commands and core services together without runtime errors', async () => {
    const soundsDirectory = await createTempDirectory('smoke-sounds');
    const dataDirectory = await createTempDirectory('smoke-data');
    tempDirectories.push(soundsDirectory, dataDirectory);

    await writeFile(path.join(soundsDirectory, 'tick.mp3'), 'fake-sound-data');

    const soundLibrary = new SoundLibrary(soundsDirectory);
    await soundLibrary.waitForInitialScan();

    const configService = new ConfigService(dataDirectory);
    const densityCurveService = new DensityCurveService(dataDirectory);
    densityCurveServices.push(densityCurveService);
    const soundConfigService = new SoundConfigService(dataDirectory);
    const sessionManager = new SessionManager(
      {
        joinChannel: vi.fn().mockResolvedValue({}),
        leaveChannel: vi.fn(),
        registerGuildAudioPlayer: vi.fn(),
        playSound: vi.fn().mockResolvedValue(undefined),
        handleVoiceStateUpdate: vi.fn(),
      } as never,
      soundLibrary,
      soundConfigService,
      densityCurveService,
    );

    const commands = getCommands({
      configService,
      densityCurveService,
      sessionManager,
      soundConfigService,
      soundLibrary,
      startedAt: new Date('2026-03-12T00:00:00.000Z'),
    });

    expect(commands.size).toBe(8);

    const statusCommand = commands.get('status');
    expect(statusCommand).toBeDefined();

    sessionManager.getSession = vi.fn().mockReturnValue(createSessionMock()) as never;

    const { interaction, reply } = createInteractionMock({ commandName: 'status' });

    await statusCommand?.execute(interaction);

    expect(reply).toHaveBeenCalledWith({ embeds: [expect.anything()] });
  });
});
