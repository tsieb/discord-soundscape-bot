import { describe, expect, it } from 'vitest';
import {
  CURVE_PRESET_NAMES,
  CURVE_PRESETS,
  createUniformCurve,
} from '../../src/data/curve-presets';
import {
  buildCdf,
  sampleFromCdf,
  validateCurve,
} from '../../src/services/density-curve-math';

describe('curve presets', () => {
  it('exports the expected preset names', () => {
    expect(CURVE_PRESET_NAMES).toEqual([
      'ambient',
      'bursty',
      'sparse',
      'uniform',
      'heartbeat',
    ]);
  });

  it('samples valid values for every preset', () => {
    for (const presetName of CURVE_PRESET_NAMES) {
      const preset = CURVE_PRESETS[presetName];
      const points =
        preset.kind === 'uniform'
          ? createUniformCurve(30, 300)
          : preset.points;

      if (points === undefined) {
        throw new Error(`Expected points for preset ${presetName}`);
      }

      expect(validateCurve(points)).toEqual({ ok: true });

      const cdf = buildCdf(points);
      for (let index = 0; index < 250; index += 1) {
        const sample = sampleFromCdf(cdf, (index + 0.5) / 250);
        expect(Number.isFinite(sample)).toBe(true);
        expect(sample).toBeGreaterThanOrEqual(points[0].t);
        expect(sample).toBeLessThanOrEqual(points[points.length - 1].t);
      }
    }
  });
});
