import { DensityCurve } from '../types';

export type CurvePresetName =
  | 'ambient'
  | 'bursty'
  | 'sparse'
  | 'uniform'
  | 'heartbeat';

export interface CurvePresetDefinition {
  readonly name: CurvePresetName;
  readonly description: string;
  readonly kind: 'curve' | 'uniform';
  readonly points?: DensityCurve;
}

export const AMBIENT_CURVE_PRESET: CurvePresetDefinition = {
  name: 'ambient',
  description: 'Natural feel with occasional bursts and long quiet stretches.',
  kind: 'curve',
  points: [
    { t: 0, d: 0.6 },
    { t: 5, d: 1.0 },
    { t: 10, d: 0.05 },
    { t: 20, d: 0.01 },
    { t: 30, d: 0.2 },
    { t: 60, d: 4.0 },
    { t: 120, d: 6.0 },
    { t: 240, d: 3.5 },
    { t: 480, d: 1.0 },
  ],
};

export const BURSTY_CURVE_PRESET: CurvePresetDefinition = {
  name: 'bursty',
  description: 'Frequent clusters with a strong short-gap bias.',
  kind: 'curve',
  points: [
    { t: 0, d: 2.8 },
    { t: 3, d: 3.4 },
    { t: 8, d: 2.4 },
    { t: 15, d: 1.0 },
    { t: 30, d: 0.9 },
    { t: 45, d: 0.5 },
    { t: 90, d: 0.15 },
  ],
};

export const SPARSE_CURVE_PRESET: CurvePresetDefinition = {
  name: 'sparse',
  description: 'Long silences dominate with a late, broad tail.',
  kind: 'curve',
  points: [
    { t: 0, d: 0.02 },
    { t: 30, d: 0.02 },
    { t: 60, d: 0.08 },
    { t: 120, d: 0.7 },
    { t: 240, d: 2.0 },
    { t: 420, d: 2.4 },
    { t: 600, d: 1.8 },
    { t: 900, d: 0.6 },
  ],
};

export const UNIFORM_CURVE_PRESET: CurvePresetDefinition = {
  name: 'uniform',
  description: 'Legacy even spacing using the current min and max interval.',
  kind: 'uniform',
};

export const HEARTBEAT_CURVE_PRESET: CurvePresetDefinition = {
  name: 'heartbeat',
  description: 'Regular rhythm with slight variation around a central peak.',
  kind: 'curve',
  points: [
    { t: 30, d: 0.05 },
    { t: 45, d: 0.8 },
    { t: 60, d: 2.5 },
    { t: 75, d: 0.8 },
    { t: 90, d: 0.05 },
  ],
};

export const CURVE_PRESETS: Record<CurvePresetName, CurvePresetDefinition> = {
  ambient: AMBIENT_CURVE_PRESET,
  bursty: BURSTY_CURVE_PRESET,
  sparse: SPARSE_CURVE_PRESET,
  uniform: UNIFORM_CURVE_PRESET,
  heartbeat: HEARTBEAT_CURVE_PRESET,
};

export const CURVE_PRESET_NAMES: CurvePresetName[] = [
  'ambient',
  'bursty',
  'sparse',
  'uniform',
  'heartbeat',
];

export const NON_UNIFORM_CURVE_PRESET_NAMES: Exclude<
  CurvePresetName,
  'uniform'
>[] = ['ambient', 'bursty', 'sparse', 'heartbeat'];

export const createUniformCurve = (
  minInterval: number,
  maxInterval: number,
): DensityCurve => {
  return [
    { t: minInterval, d: 1 },
    { t: maxInterval, d: 1 },
  ];
};
