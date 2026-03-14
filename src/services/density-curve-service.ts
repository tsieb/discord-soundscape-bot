import {
  existsSync,
  FSWatcher,
  mkdirSync,
  readFileSync,
  watch,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  AMBIENT_CURVE_PRESET,
  CURVE_PRESETS,
  CurvePresetDefinition,
  CurvePresetName,
  createUniformCurve,
} from '../data/curve-presets';
import {
  buildCdf,
  DensityCurveCdf,
  sampleFromCdf,
  validateCurve,
} from './density-curve-math';
import { DensityCurve } from '../types';
import * as logger from '../util/logger';

const DEFAULT_UNIFORM_MIN_INTERVAL = 30;
const DEFAULT_UNIFORM_MAX_INTERVAL = 300;

type StoredCurvePresetName = CurvePresetName | 'custom';

interface StoredDensityCurveEntry {
  preset: StoredCurvePresetName;
  points?: DensityCurve;
}

type StoredDensityCurveRecord = Record<string, StoredDensityCurveEntry>;

interface CompiledDensityCurveEntry {
  readonly preset: StoredCurvePresetName;
  readonly points: DensityCurve;
  readonly cdf: DensityCurveCdf;
}

type DensityCurveChangeListener = (guildId: string) => void;

export class InvalidDensityCurveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDensityCurveError';
  }
}

export class DensityCurvePersistenceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
    this.name = 'DensityCurvePersistenceError';
  }
}

export class DensityCurveService {
  private readonly dataDirectory: string;

  private readonly curveFilePath: string;

  private readonly storedCurves: StoredDensityCurveRecord;

  private readonly compiledCurves = new Map<string, CompiledDensityCurveEntry>();

  private readonly listeners = new Set<DensityCurveChangeListener>();

  private readonly watcher: FSWatcher;

  constructor(dataDirectory = process.env.DATA_DIR ?? './data') {
    this.dataDirectory = path.resolve(dataDirectory);
    this.curveFilePath = path.join(this.dataDirectory, 'density-curves.json');
    mkdirSync(this.dataDirectory, { recursive: true });
    this.storedCurves = this.loadCurves();
    this.rebuildCompiledCurves();
    this.watcher = watch(this.dataDirectory, (_eventType, fileName) => {
      if (fileName !== null && fileName !== 'density-curves.json') {
        return;
      }

      this.reloadFromDisk();
    });
  }

  public close(): void {
    this.watcher.close();
  }

  public getCurve(guildId: string): DensityCurve {
    return this.getCompiledEntry(guildId).points.map((point) => ({ ...point }));
  }

  public getPresetName(guildId: string): StoredCurvePresetName {
    return this.storedCurves[guildId]?.preset ?? AMBIENT_CURVE_PRESET.name;
  }

  public isUniformPreset(guildId: string): boolean {
    return this.getPresetName(guildId) === 'uniform';
  }

  public async setCurve(guildId: string, curve: DensityCurve): Promise<void> {
    this.validateDensityCurve(curve);
    this.storedCurves[guildId] = {
      preset: 'custom',
      points: curve.map((point) => ({ ...point })),
    };
    this.rebuildCompiledCurve(guildId);
    this.persistCurves();
    this.emitChange(guildId);
  }

  public async applyPreset(
    guildId: string,
    preset: CurvePresetName,
  ): Promise<void> {
    if (preset === AMBIENT_CURVE_PRESET.name) {
      delete this.storedCurves[guildId];
      this.compiledCurves.delete(guildId);
    } else {
      this.storedCurves[guildId] = { preset };
      this.rebuildCompiledCurve(guildId);
    }

    this.persistCurves();
    this.emitChange(guildId);
  }

  public sample(guildId: string): number {
    const compiledEntry = this.getCompiledEntry(guildId);
    return sampleFromCdf(compiledEntry.cdf);
  }

  public getCdfData(guildId: string): { t: number[]; cdf: number[] } {
    const compiledEntry = this.getCompiledEntry(guildId);
    return {
      t: [...compiledEntry.cdf.t],
      cdf: [...compiledEntry.cdf.cdf],
    };
  }

  public subscribe(listener: DensityCurveChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private reloadFromDisk(): void {
    const previousState = JSON.stringify(this.storedCurves);
    const nextStoredCurves = this.loadCurves();
    const nextState = JSON.stringify(nextStoredCurves);

    if (previousState === nextState) {
      return;
    }

    for (const guildId of Object.keys(this.storedCurves)) {
      delete this.storedCurves[guildId];
    }
    Object.assign(this.storedCurves, nextStoredCurves);
    this.rebuildCompiledCurves();

    const changedGuildIds = new Set<string>([
      ...Object.keys(JSON.parse(previousState || '{}') as StoredDensityCurveRecord),
      ...Object.keys(nextStoredCurves),
    ]);

    for (const guildId of changedGuildIds) {
      this.emitChange(guildId);
    }
  }

  private loadCurves(): StoredDensityCurveRecord {
    if (!existsSync(this.curveFilePath)) {
      return {};
    }

    try {
      const rawContents = readFileSync(this.curveFilePath, 'utf8');
      const parsed = JSON.parse(rawContents) as unknown;
      return this.parseStoredCurveRecord(parsed);
    } catch (error: unknown) {
      logger.warn(
        `Failed to read ${this.curveFilePath}. Resetting to default density curve map.`,
      );
      logger.debug(`Density curve read error details: ${String(error)}`);
      return {};
    }
  }

  private parseStoredCurveRecord(rawValue: unknown): StoredDensityCurveRecord {
    if (!DensityCurveService.isPlainObject(rawValue)) {
      throw new InvalidDensityCurveError(
        'Density curve file root must be an object.',
      );
    }

    const parsedRecord: StoredDensityCurveRecord = {};
    for (const [guildId, rawEntry] of Object.entries(rawValue)) {
      if (!DensityCurveService.isPlainObject(rawEntry)) {
        logger.warn(`Skipping invalid density curve entry for guild ${guildId}.`);
        continue;
      }

      try {
        parsedRecord[guildId] = this.parseStoredCurveEntry(rawEntry);
      } catch (error: unknown) {
        logger.warn(`Skipping invalid density curve entry for guild ${guildId}.`);
        logger.debug(`Invalid density curve details: ${String(error)}`);
      }
    }

    return parsedRecord;
  }

  private parseStoredCurveEntry(
    rawEntry: Record<string, unknown>,
  ): StoredDensityCurveEntry {
    const preset = rawEntry.preset;
    if (
      preset !== 'custom' &&
      (typeof preset !== 'string' || !(preset in CURVE_PRESETS))
    ) {
      throw new InvalidDensityCurveError(
        `Unknown density preset "${String(preset)}".`,
      );
    }

    if (preset !== 'custom') {
      return { preset: preset as CurvePresetName };
    }

    if (!Array.isArray(rawEntry.points)) {
      throw new InvalidDensityCurveError(
        'Custom density curve entries must include a points array.',
      );
    }

    const points = rawEntry.points.map((rawPoint, index) => {
      if (!DensityCurveService.isPlainObject(rawPoint)) {
        throw new InvalidDensityCurveError(
          `Density curve point at index ${index} must be an object.`,
        );
      }

      return {
        t: rawPoint.t as number,
        d: rawPoint.d as number,
      };
    });

    this.validateDensityCurve(points);
    return { preset, points };
  }

  private validateDensityCurve(curve: DensityCurve): void {
    const validationResult = validateCurve(curve);
    if (validationResult.ok) {
      return;
    }

    throw new InvalidDensityCurveError(validationResult.error);
  }

  private getCompiledEntry(guildId: string): CompiledDensityCurveEntry {
    const compiledEntry = this.compiledCurves.get(guildId);
    if (compiledEntry !== undefined) {
      return compiledEntry;
    }

    return this.compilePresetEntry(AMBIENT_CURVE_PRESET);
  }

  private rebuildCompiledCurves(): void {
    this.compiledCurves.clear();
    for (const guildId of Object.keys(this.storedCurves)) {
      this.rebuildCompiledCurve(guildId);
    }
  }

  private rebuildCompiledCurve(guildId: string): void {
    const entry = this.storedCurves[guildId];
    if (entry === undefined) {
      this.compiledCurves.delete(guildId);
      return;
    }

    if (entry.preset === 'custom') {
      const points = entry.points ?? [];
      this.compiledCurves.set(guildId, {
        preset: 'custom',
        points,
        cdf: buildCdf(points),
      });
      return;
    }

    this.compiledCurves.set(
      guildId,
      this.compilePresetEntry(CURVE_PRESETS[entry.preset]),
    );
  }

  private compilePresetEntry(
    preset: CurvePresetDefinition,
  ): CompiledDensityCurveEntry {
    const points =
      preset.kind === 'uniform'
        ? createUniformCurve(
            DEFAULT_UNIFORM_MIN_INTERVAL,
            DEFAULT_UNIFORM_MAX_INTERVAL,
          )
        : preset.points;

    if (points === undefined) {
      throw new InvalidDensityCurveError(
        `Preset ${preset.name} does not define any points.`,
      );
    }

    return {
      preset: preset.name,
      points,
      cdf: buildCdf(points),
    };
  }

  private persistCurves(): void {
    try {
      mkdirSync(this.dataDirectory, { recursive: true });
      writeFileSync(
        this.curveFilePath,
        JSON.stringify(this.storedCurves, null, 2),
      );
    } catch (error: unknown) {
      throw new DensityCurvePersistenceError(
        `Failed to persist density curves to ${this.curveFilePath}.`,
        error,
      );
    }
  }

  private emitChange(guildId: string): void {
    for (const listener of this.listeners) {
      listener(guildId);
    }
  }

  private static isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
