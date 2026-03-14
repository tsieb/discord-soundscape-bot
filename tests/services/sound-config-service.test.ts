import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InvalidSoundConfigError,
  SoundConfigService,
} from '../../src/services/sound-config-service';
import {
  createTempDirectory,
  removeTempDirectory,
} from '../helpers/temp-directory';

describe('SoundConfigService', () => {
  let tempDirectory = '';

  beforeEach(async () => {
    tempDirectory = await createTempDirectory('sound-config-service-test');
  });

  afterEach(async () => {
    await removeTempDirectory(tempDirectory);
  });

  it('returns defaults for sounds without stored config', () => {
    const service = new SoundConfigService(tempDirectory);

    expect(service.getSoundConfig('guild-a', 'Rainstorm')).toEqual({
      volume: 1,
      weight: 1,
      enabled: true,
    });
    expect(service.getAllSoundConfigs('guild-a')).toEqual(new Map());
  });

  it('persists partial config updates while eliding defaults', async () => {
    const service = new SoundConfigService(tempDirectory);

    const updated = await service.setSoundConfig('guild-a', 'Thunderclap', {
      volume: 1.4,
      weight: 0.2,
      minInterval: 180,
      maxInterval: 600,
    });

    expect(updated).toEqual({
      volume: 1.4,
      weight: 0.2,
      enabled: true,
      minInterval: 180,
      maxInterval: 600,
    });
    expect(service.getSoundConfig('guild-a', 'Thunderclap')).toEqual(updated);

    const persisted = JSON.parse(
      await readFile(path.join(tempDirectory, 'sound-configs.json'), 'utf8'),
    ) as Record<string, Record<string, unknown>>;

    expect(persisted).toEqual({
      'guild-a': {
        Thunderclap: {
          volume: 1.4,
          weight: 0.2,
          minInterval: 180,
          maxInterval: 600,
        },
      },
    });
  });

  it('merges updates and returns all stored configs for a guild', async () => {
    const service = new SoundConfigService(tempDirectory);

    await service.setSoundConfig('guild-a', 'Rainstorm', {
      weight: 2,
    });
    await service.setSoundConfig('guild-a', 'Crickets', {
      enabled: false,
      volume: 0,
    });

    expect(service.getAllSoundConfigs('guild-a')).toEqual(
      new Map([
        [
          'Rainstorm',
          {
            volume: 1,
            weight: 2,
            enabled: true,
          },
        ],
        [
          'Crickets',
          {
            volume: 0,
            weight: 1,
            enabled: false,
          },
        ],
      ]),
    );
  });

  it('resets a sound config back to defaults and removes persisted state', async () => {
    const service = new SoundConfigService(tempDirectory);
    await service.setSoundConfig('guild-a', 'Crickets', {
      enabled: false,
      volume: 0,
    });

    const reset = await service.resetSoundConfig('guild-a', 'Crickets');

    expect(reset).toEqual({
      volume: 1,
      weight: 1,
      enabled: true,
    });
    expect(service.getAllSoundConfigs('guild-a')).toEqual(new Map());

    const persisted = JSON.parse(
      await readFile(path.join(tempDirectory, 'sound-configs.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(persisted['guild-a']).toBeUndefined();
  });

  it('skips invalid persisted records while loading', async () => {
    await writeFile(
      path.join(tempDirectory, 'sound-configs.json'),
      JSON.stringify({
        'guild-a': {
          Rainstorm: {
            weight: 2,
          },
          Broken: {
            volume: 9,
          },
        },
        'guild-b': 'invalid',
      }),
    );

    const service = new SoundConfigService(tempDirectory);

    expect(service.getSoundConfig('guild-a', 'Rainstorm')).toEqual({
      volume: 1,
      weight: 2,
      enabled: true,
    });
    expect(service.getSoundConfig('guild-a', 'Broken')).toEqual({
      volume: 1,
      weight: 1,
      enabled: true,
    });
    expect(service.getAllSoundConfigs('guild-b')).toEqual(new Map());
  });

  it('validates new values before persisting', async () => {
    const service = new SoundConfigService(tempDirectory);

    await expect(
      service.setSoundConfig('guild-a', 'Rainstorm', {
        weight: 0.01,
      }),
    ).rejects.toThrow(InvalidSoundConfigError);

    await expect(
      service.setSoundConfig('guild-a', 'Rainstorm', {
        minInterval: 60,
        maxInterval: 10,
      }),
    ).rejects.toThrow(InvalidSoundConfigError);
  });

  it('treats resetting to defaults as removing the stored entry', async () => {
    const service = new SoundConfigService(tempDirectory);

    await service.setSoundConfig('guild-a', 'Rainstorm', {
      weight: 2,
    });
    await service.setSoundConfig('guild-a', 'Rainstorm', {
      weight: 1,
    });

    expect(service.getAllSoundConfigs('guild-a')).toEqual(new Map());
  });
});
