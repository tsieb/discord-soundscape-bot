import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConfigService,
  InvalidGuildConfigError,
} from '../../src/services/config-service';
import {
  createTempDirectory,
  removeTempDirectory,
} from '../helpers/temp-directory';

const ORIGINAL_ENV = { ...process.env };

describe('ConfigService', () => {
  let tempDirectory = '';

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DEFAULT_MIN_INTERVAL;
    delete process.env.DEFAULT_MAX_INTERVAL;
    delete process.env.DEFAULT_VOLUME;
    tempDirectory = await createTempDirectory('config-service-test');
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    await removeTempDirectory(tempDirectory);
  });

  it('uses built-in defaults when env values are absent', () => {
    const service = new ConfigService(tempDirectory);

    expect(service.getDefaultConfig()).toEqual({
      minInterval: 30,
      maxInterval: 300,
      volume: 0.5,
    });
  });

  it('reads default config from environment values', () => {
    process.env.DEFAULT_MIN_INTERVAL = '15';
    process.env.DEFAULT_MAX_INTERVAL = '45';
    process.env.DEFAULT_VOLUME = '0.7';

    const service = new ConfigService(tempDirectory);

    expect(service.getDefaultConfig()).toEqual({
      minInterval: 15,
      maxInterval: 45,
      volume: 0.7,
    });
  });

  it('throws for invalid environment values', () => {
    process.env.DEFAULT_MIN_INTERVAL = 'not-a-number';

    expect(() => new ConfigService(tempDirectory)).toThrow(InvalidGuildConfigError);
  });

  it('merges partial updates and persists config', async () => {
    const service = new ConfigService(tempDirectory);

    service.setConfig('guild-a', {
      maxInterval: 120,
      volume: 0.2,
    });

    expect(service.getConfig('guild-a')).toEqual({
      minInterval: 30,
      maxInterval: 120,
      volume: 0.2,
    });

    const persisted = JSON.parse(
      await readFile(path.join(tempDirectory, 'config.json'), 'utf8'),
    ) as Record<string, { minInterval: number; maxInterval: number; volume: number }>;

    expect(persisted['guild-a']).toEqual({
      minInterval: 30,
      maxInterval: 120,
      volume: 0.2,
    });
  });

  it('resets guild config back to defaults and updates persistence', async () => {
    const service = new ConfigService(tempDirectory);
    service.setConfig('guild-a', { minInterval: 90, maxInterval: 150, volume: 0.8 });

    const reset = service.resetConfig('guild-a');

    expect(reset).toEqual({ minInterval: 30, maxInterval: 300, volume: 0.5 });

    const persisted = JSON.parse(
      await readFile(path.join(tempDirectory, 'config.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(persisted['guild-a']).toBeUndefined();
  });

  it('falls back to defaults when config file is corrupted', async () => {
    await writeFile(path.join(tempDirectory, 'config.json'), '{bad json');

    const service = new ConfigService(tempDirectory);

    expect(service.getConfig('guild-a')).toEqual({
      minInterval: 30,
      maxInterval: 300,
      volume: 0.5,
    });
  });

  it('skips invalid guild records while loading persisted config', async () => {
    await writeFile(
      path.join(tempDirectory, 'config.json'),
      JSON.stringify({
        good: {
          minInterval: 10,
          maxInterval: 20,
          volume: 0.3,
        },
        bad: {
          minInterval: 0,
          maxInterval: 1,
          volume: 5,
        },
      }),
    );

    const service = new ConfigService(tempDirectory);

    expect(service.getConfig('good')).toEqual({
      minInterval: 10,
      maxInterval: 20,
      volume: 0.3,
    });
    expect(service.getConfig('bad')).toEqual({
      minInterval: 30,
      maxInterval: 300,
      volume: 0.5,
    });
  });

  it('validates persisted and updated values', () => {
    const service = new ConfigService(tempDirectory);

    expect(() => {
      service.setConfig('guild-a', { minInterval: 0 });
    }).toThrow(InvalidGuildConfigError);

    expect(() => {
      service.setConfig('guild-a', { volume: 1.1 });
    }).toThrow(InvalidGuildConfigError);
  });
});
