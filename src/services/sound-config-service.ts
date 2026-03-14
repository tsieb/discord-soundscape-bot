import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SoundConfig } from '../types';
import * as logger from '../util/logger';

const DEFAULT_SOUND_CONFIG: SoundConfig = {
  volume: 1,
  weight: 1,
  enabled: true,
};

type StoredSoundConfig = Partial<SoundConfig>;
type GuildSoundConfigRecord = Record<string, StoredSoundConfig>;
type SoundConfigRecord = Record<string, GuildSoundConfigRecord>;
type SoundConfigChangeListener = (
  guildId: string,
  soundName: string,
  config: SoundConfig,
) => void;

export class InvalidSoundConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSoundConfigError';
  }
}

export class SoundConfigPersistenceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
    this.name = 'SoundConfigPersistenceError';
  }
}

export class SoundConfigService {
  private readonly dataDirectory: string;

  private readonly configFilePath: string;

  private readonly configs: SoundConfigRecord;

  private readonly listeners = new Set<SoundConfigChangeListener>();

  constructor(dataDirectory = process.env.DATA_DIR ?? './data') {
    this.dataDirectory = path.resolve(dataDirectory);
    this.configFilePath = path.join(this.dataDirectory, 'sound-configs.json');
    this.configs = this.loadConfigs();
  }

  public getSoundConfig(guildId: string, soundName: string): SoundConfig {
    const storedConfig = this.configs[guildId]?.[soundName];
    if (storedConfig === undefined) {
      return { ...DEFAULT_SOUND_CONFIG };
    }

    return SoundConfigService.mergeWithDefaults(storedConfig);
  }

  public async setSoundConfig(
    guildId: string,
    soundName: string,
    partial: Partial<SoundConfig>,
  ): Promise<SoundConfig> {
    const currentConfig = this.getSoundConfig(guildId, soundName);
    const nextConfig: SoundConfig = {
      volume:
        SoundConfigService.hasOwnProperty(partial, 'volume') &&
        partial.volume !== undefined
          ? partial.volume
        : currentConfig.volume,
      weight:
        SoundConfigService.hasOwnProperty(partial, 'weight') &&
        partial.weight !== undefined
          ? partial.weight
        : currentConfig.weight,
      enabled:
        SoundConfigService.hasOwnProperty(partial, 'enabled') &&
        partial.enabled !== undefined
          ? partial.enabled
        : currentConfig.enabled,
      minInterval: SoundConfigService.hasOwnProperty(partial, 'minInterval')
        ? partial.minInterval
        : currentConfig.minInterval,
      maxInterval: SoundConfigService.hasOwnProperty(partial, 'maxInterval')
        ? partial.maxInterval
        : currentConfig.maxInterval,
    };

    SoundConfigService.validateSoundConfig(nextConfig);

    const nextStoredConfig = SoundConfigService.compactConfig(nextConfig);
    if (Object.keys(nextStoredConfig).length === 0) {
      this.deleteStoredConfig(guildId, soundName);
    } else {
      const guildConfigs = this.configs[guildId] ?? {};
      guildConfigs[soundName] = nextStoredConfig;
      this.configs[guildId] = guildConfigs;
    }

    this.persistConfigs();
    logger.info(`Saved sound config for "${soundName}" in guild ${guildId}.`);

    this.emitChange(guildId, soundName, nextConfig);
    return { ...nextConfig };
  }

  public async resetSoundConfig(
    guildId: string,
    soundName: string,
  ): Promise<SoundConfig> {
    this.deleteStoredConfig(guildId, soundName);
    this.persistConfigs();
    logger.info(`Reset sound config for "${soundName}" in guild ${guildId}.`);
    const nextConfig = { ...DEFAULT_SOUND_CONFIG };
    this.emitChange(guildId, soundName, nextConfig);
    return nextConfig;
  }

  public getAllSoundConfigs(guildId: string): Map<string, SoundConfig> {
    const guildConfigs = this.configs[guildId];
    if (guildConfigs === undefined) {
      return new Map<string, SoundConfig>();
    }

    return new Map<string, SoundConfig>(
      Object.entries(guildConfigs).map(([soundName, config]) => {
        return [soundName, SoundConfigService.mergeWithDefaults(config)];
      }),
    );
  }

  public subscribe(listener: SoundConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private deleteStoredConfig(guildId: string, soundName: string): void {
    const guildConfigs = this.configs[guildId];
    if (guildConfigs === undefined || guildConfigs[soundName] === undefined) {
      return;
    }

    delete guildConfigs[soundName];
    if (Object.keys(guildConfigs).length === 0) {
      delete this.configs[guildId];
    }
  }

  private loadConfigs(): SoundConfigRecord {
    if (!existsSync(this.configFilePath)) {
      return {};
    }

    try {
      const rawContents = readFileSync(this.configFilePath, 'utf8');
      const parsed = JSON.parse(rawContents) as unknown;
      return this.parseConfigRecord(parsed);
    } catch (error: unknown) {
      logger.warn(
        `Failed to read ${this.configFilePath}. Resetting to empty sound config map.`,
      );
      logger.debug(`Sound config read error details: ${String(error)}`);
      return {};
    }
  }

  private parseConfigRecord(rawValue: unknown): SoundConfigRecord {
    if (!SoundConfigService.isPlainObject(rawValue)) {
      throw new InvalidSoundConfigError(
        'Sound config file root must be an object.',
      );
    }

    const parsedRecord: SoundConfigRecord = {};
    for (const [guildId, rawGuildConfigs] of Object.entries(rawValue)) {
      if (!SoundConfigService.isPlainObject(rawGuildConfigs)) {
        logger.warn(`Skipping invalid sound config map for guild ${guildId}.`);
        continue;
      }

      const parsedGuildConfigs: GuildSoundConfigRecord = {};
      for (const [soundName, rawConfig] of Object.entries(rawGuildConfigs)) {
        if (!SoundConfigService.isPlainObject(rawConfig)) {
          logger.warn(
            `Skipping invalid sound config for "${soundName}" in guild ${guildId}.`,
          );
          continue;
        }

        try {
          const parsedConfig = SoundConfigService.parseStoredSoundConfig(rawConfig);
          parsedGuildConfigs[soundName] = parsedConfig;
        } catch (error: unknown) {
          logger.warn(
            `Skipping invalid sound config for "${soundName}" in guild ${guildId}.`,
          );
          logger.debug(`Invalid sound config details: ${String(error)}`);
        }
      }

      if (Object.keys(parsedGuildConfigs).length > 0) {
        parsedRecord[guildId] = parsedGuildConfigs;
      }
    }

    return parsedRecord;
  }

  private persistConfigs(): void {
    try {
      mkdirSync(this.dataDirectory, { recursive: true });
      writeFileSync(this.configFilePath, JSON.stringify(this.configs, null, 2));
    } catch (error: unknown) {
      throw new SoundConfigPersistenceError(
        `Failed to persist sound configs to ${this.configFilePath}.`,
        error,
      );
    }
  }

  private static parseStoredSoundConfig(rawValue: Record<string, unknown>): StoredSoundConfig {
    const candidate: StoredSoundConfig = {};

    if ('volume' in rawValue) {
      candidate.volume = rawValue.volume as number;
    }

    if ('weight' in rawValue) {
      candidate.weight = rawValue.weight as number;
    }

    if ('enabled' in rawValue) {
      candidate.enabled = rawValue.enabled as boolean;
    }

    if ('minInterval' in rawValue) {
      candidate.minInterval = rawValue.minInterval as number;
    }

    if ('maxInterval' in rawValue) {
      candidate.maxInterval = rawValue.maxInterval as number;
    }

    const mergedConfig = SoundConfigService.mergeWithDefaults(candidate);
    SoundConfigService.validateSoundConfig(mergedConfig);
    return SoundConfigService.compactConfig(mergedConfig);
  }

  private static mergeWithDefaults(partial: StoredSoundConfig): SoundConfig {
    return {
      volume: partial.volume ?? DEFAULT_SOUND_CONFIG.volume,
      weight: partial.weight ?? DEFAULT_SOUND_CONFIG.weight,
      enabled: partial.enabled ?? DEFAULT_SOUND_CONFIG.enabled,
      minInterval: partial.minInterval,
      maxInterval: partial.maxInterval,
    };
  }

  private static compactConfig(config: SoundConfig): StoredSoundConfig {
    const compact: StoredSoundConfig = {};

    if (config.volume !== DEFAULT_SOUND_CONFIG.volume) {
      compact.volume = config.volume;
    }

    if (config.weight !== DEFAULT_SOUND_CONFIG.weight) {
      compact.weight = config.weight;
    }

    if (config.enabled !== DEFAULT_SOUND_CONFIG.enabled) {
      compact.enabled = config.enabled;
    }

    if (config.minInterval !== undefined) {
      compact.minInterval = config.minInterval;
    }

    if (config.maxInterval !== undefined) {
      compact.maxInterval = config.maxInterval;
    }

    return compact;
  }

  private static validateSoundConfig(config: SoundConfig): void {
    if (!Number.isFinite(config.volume) || config.volume < 0 || config.volume > 2) {
      throw new InvalidSoundConfigError(
        `Invalid volume (${config.volume}). Expected a finite number between 0 and 2.`,
      );
    }

    if (!Number.isFinite(config.weight) || config.weight < 0.1 || config.weight > 10) {
      throw new InvalidSoundConfigError(
        `Invalid weight (${config.weight}). Expected a finite number between 0.1 and 10.`,
      );
    }

    if (typeof config.enabled !== 'boolean') {
      throw new InvalidSoundConfigError(
        `Invalid enabled flag (${String(config.enabled)}). Expected a boolean value.`,
      );
    }

    if (
      config.minInterval !== undefined &&
      (!Number.isFinite(config.minInterval) || config.minInterval <= 0)
    ) {
      throw new InvalidSoundConfigError(
        `Invalid minInterval (${config.minInterval}). Expected a finite number greater than 0.`,
      );
    }

    if (
      config.maxInterval !== undefined &&
      (!Number.isFinite(config.maxInterval) ||
        config.maxInterval < (config.minInterval ?? 0))
    ) {
      throw new InvalidSoundConfigError(
        `Invalid maxInterval (${config.maxInterval}). Expected a finite number greater than or equal to minInterval.`,
      );
    }
  }

  private static isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static hasOwnProperty<T extends object, K extends PropertyKey>(
    value: T,
    key: K,
  ): value is T & Record<K, unknown> {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  private emitChange(
    guildId: string,
    soundName: string,
    config: SoundConfig,
  ): void {
    for (const listener of this.listeners) {
      listener(guildId, soundName, { ...config });
    }
  }
}
