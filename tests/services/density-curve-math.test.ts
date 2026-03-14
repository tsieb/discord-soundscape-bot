import { describe, expect, it } from 'vitest';
import {
  buildCdf,
  sampleFromCdf,
  validateCurve,
} from '../../src/services/density-curve-math';
import { DensityCurve } from '../../src/types';

const AMBIENT_LIKE_CURVE: DensityCurve = [
  { t: 0, d: 0.6 },
  { t: 5, d: 1.0 },
  { t: 10, d: 0.05 },
  { t: 20, d: 0.01 },
  { t: 30, d: 0.2 },
  { t: 60, d: 4.0 },
  { t: 120, d: 6.0 },
  { t: 240, d: 3.5 },
  { t: 480, d: 1.0 },
];

const getQuantile = (values: number[], percentile: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(percentile * sorted.length)),
  );
  return sorted[index];
};

describe('density curve math', () => {
  it('validates curve constraints', () => {
    expect(validateCurve([{ t: 0, d: 1 }])).toEqual({
      error: 'At least 2 points required',
    });
    expect(
      validateCurve([
        { t: -1, d: 1 },
        { t: 1, d: 2 },
      ]),
    ).toEqual({
      error: 'First time value must be greater than or equal to 0',
    });
    expect(
      validateCurve([
        { t: 0, d: 1 },
        { t: 0, d: 2 },
      ]),
    ).toEqual({
      error: 't values must be strictly increasing (index 1)',
    });
    expect(
      validateCurve([
        { t: 0, d: 1 },
        { t: 1, d: -1 },
      ]),
    ).toEqual({
      error: 'Density must be non-negative (index 1)',
    });
    expect(
      validateCurve([
        { t: 0, d: 0 },
        { t: 1, d: 0 },
      ]),
    ).toEqual({
      error: 'At least one density value must be > 0',
    });
  });

  it('builds a normalized CDF for a constant-density segment', () => {
    const cdf = buildCdf([
      { t: 0, d: 1 },
      { t: 10, d: 1 },
    ]);

    expect(cdf.t).toEqual([0, 10]);
    expect(cdf.cdf).toEqual([0, 1]);
    expect(cdf.totalArea).toBe(10);
  });

  it('samples linearly from a uniform segment', () => {
    const cdf = buildCdf([
      { t: 10, d: 4 },
      { t: 20, d: 4 },
    ]);

    expect(sampleFromCdf(cdf, 0)).toBe(10);
    expect(sampleFromCdf(cdf, 0.25)).toBeCloseTo(12.5);
    expect(sampleFromCdf(cdf, 0.5)).toBeCloseTo(15);
    expect(sampleFromCdf(cdf, 1)).toBe(20);
  });

  it('follows the expected shape for a single triangular spike', () => {
    const cdf = buildCdf([
      { t: 0, d: 0 },
      { t: 10, d: 2 },
      { t: 20, d: 0 },
    ]);

    expect(sampleFromCdf(cdf, 0.125)).toBeCloseTo(5, 5);
    expect(sampleFromCdf(cdf, 0.5)).toBeCloseTo(10, 5);
    expect(sampleFromCdf(cdf, 0.875)).toBeCloseTo(15, 5);
  });

  it('keeps 10,000 ambient-like draws inside expected quantile bands', () => {
    const cdf = buildCdf(AMBIENT_LIKE_CURVE);
    const draws = Array.from({ length: 10_000 }, (_, index) => {
      return sampleFromCdf(cdf, (index + 0.5) / 10_000);
    });
    const burstZoneCount = draws.filter((draw) => draw <= 10).length;
    const forbiddenZoneCount = draws.filter((draw) => draw > 10 && draw < 30).length;
    const primaryZoneCount = draws.filter((draw) => draw >= 30).length;

    expect(burstZoneCount / draws.length).toBeGreaterThan(0.001);
    expect(burstZoneCount / draws.length).toBeLessThan(0.02);
    expect(forbiddenZoneCount / draws.length).toBeLessThan(0.03);
    expect(primaryZoneCount / draws.length).toBeGreaterThan(0.88);
    expect(getQuantile(draws, 0.25)).toBeGreaterThan(100);
    expect(getQuantile(draws, 0.25)).toBeLessThan(140);
    expect(getQuantile(draws, 0.5)).toBeGreaterThan(170);
    expect(getQuantile(draws, 0.5)).toBeLessThan(220);
    expect(getQuantile(draws, 0.75)).toBeGreaterThan(260);
    expect(getQuantile(draws, 0.75)).toBeLessThan(340);
  });
});
