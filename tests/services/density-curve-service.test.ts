import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURVE_PRESETS } from '../../src/data/curve-presets';
import {
  DensityCurveService,
  InvalidDensityCurveError,
} from '../../src/services/density-curve-service';
import {
  createTempDirectory,
  removeTempDirectory,
} from '../helpers/temp-directory';

describe('DensityCurveService', () => {
  let tempDirectory = '';
  let service: DensityCurveService;

  beforeEach(async () => {
    tempDirectory = await createTempDirectory('density-curve-service-test');
    service = new DensityCurveService(tempDirectory);
  });

  afterEach(async () => {
    service.close();
    await removeTempDirectory(tempDirectory);
    vi.restoreAllMocks();
  });

  it('persists custom curves to disk and returns the stored points', async () => {
    const curve = [
      { t: 0, d: 0.5 },
      { t: 5, d: 1.2 },
      { t: 25, d: 0.3 },
    ];

    await service.setCurve('guild-a', curve);

    expect(service.getPresetName('guild-a')).toBe('custom');
    expect(service.getCurve('guild-a')).toEqual(curve);

    const persisted = JSON.parse(
      await readFile(path.join(tempDirectory, 'density-curves.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(persisted['guild-a']).toEqual({
      preset: 'custom',
      points: curve,
    });
  });

  it('rejects invalid custom curves before persisting', async () => {
    await expect(
      service.setCurve('guild-a', [
        { t: 0, d: 1 },
        { t: 0, d: 2 },
      ]),
    ).rejects.toThrow(InvalidDensityCurveError);

    expect(service.getPresetName('guild-a')).toBe('ambient');
  });

  it('applies named presets and exposes CDF data', async () => {
    await service.applyPreset('guild-a', 'sparse');

    expect(service.getPresetName('guild-a')).toBe('sparse');
    expect(service.getCurve('guild-a')).toEqual(CURVE_PRESETS.sparse.points);
    expect(service.getCdfData('guild-a').cdf.at(-1)).toBe(1);
    expect(service.sample('guild-a')).toBeGreaterThanOrEqual(
      CURVE_PRESETS.sparse.points?.[0].t ?? 0,
    );
  });

  it('hot-reloads external file changes and notifies listeners', async () => {
    const listener = vi.fn();
    service.subscribe(listener);

    await writeFile(
      path.join(tempDirectory, 'density-curves.json'),
      JSON.stringify({
        'guild-a': {
          preset: 'bursty',
        },
      }),
    );

    await vi.waitFor(() => {
      expect(service.getPresetName('guild-a')).toBe('bursty');
    });
    expect(listener).toHaveBeenCalledWith('guild-a');
  });

  it('falls back to ambient defaults when the file is corrupted', async () => {
    service.close();
    await writeFile(path.join(tempDirectory, 'density-curves.json'), '{bad json');
    service = new DensityCurveService(tempDirectory);

    expect(service.getPresetName('guild-a')).toBe('ambient');
    expect(service.getCurve('guild-a')).toEqual(CURVE_PRESETS.ambient.points);
  });
});
