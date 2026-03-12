import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GuildConfig } from '../types';
import * as logger from '../util/logger';

const DEFAULT_MIN_INTERVAL = 30;
const DEFAULT_MAX_INTERVAL = 300;
const DEFAULT_VOLUME = 0.5;

type GuildConfigRecord = Record<string, GuildConfig>;

export class InvalidGuildConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGuildConfigError';
  }
}

export class ConfigPersistenceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
    this.name = 'ConfigPersistenceError';
  }
}

export class ConfigService {
  private readonly dataDirectory: string;

  private readonly configFilePath: string;

  private readonly defaultConfig: GuildConfig;

  private readonly configs: GuildConfigRecord;

  constructor(dataDirectory = process.env.DATA_DIR ?? './data') {
    this.dataDirectory = path.resolve(dataDirectory);
    this.configFilePath = path.join(this.dataDirectory, 'config.json');
    this.defaultConfig = this.loadDefaultConfig();
    this.configs = this.loadConfigs();
  }

  public getConfig(guildId: string): GuildConfig {
    const config = this.configs[guildId] ?? this.defaultConfig;
    return { ...config };
  }

  public getDefaultConfig(): GuildConfig {
    return { ...this.defaultConfig };
  }

  public setConfig(guildId: string, partial: Partial<GuildConfig>): void {
    const currentConfig = this.getConfig(guildId);
    const nextConfig = this.mergeConfig(currentConfig, partial);
    this.validateGuildConfig(nextConfig);

    this.configs[guildId] = nextConfig;
    this.persistConfigs();

    logger.info(`Saved config for guild ${guildId}.`);
  }

  public resetConfig(guildId: string): GuildConfig {
    if (this.configs[guildId] !== undefined) {
      delete this.configs[guildId];
      this.persistConfigs();
      logger.info(`Reset config for guild ${guildId} to defaults.`);
    }

    return this.getDefaultConfig();
  }

  private mergeConfig(
    current: GuildConfig,
    partial: Partial<GuildConfig>,
  ): GuildConfig {
    return {
      minInterval: partial.minInterval ?? current.minInterval,
      maxInterval: partial.maxInterval ?? current.maxInterval,
      volume: partial.volume ?? current.volume,
    };
  }

  private loadDefaultConfig(): GuildConfig {
    const minInterval = this.parseEnvNumber(
      'DEFAULT_MIN_INTERVAL',
      DEFAULT_MIN_INTERVAL,
    );
    const maxInterval = this.parseEnvNumber(
      'DEFAULT_MAX_INTERVAL',
      DEFAULT_MAX_INTERVAL,
    );
    const volume = this.parseEnvNumber('DEFAULT_VOLUME', DEFAULT_VOLUME);

    const defaultConfig: GuildConfig = {
      minInterval,
      maxInterval,
      volume,
    };

    this.validateGuildConfig(defaultConfig);
    return defaultConfig;
  }

  private parseEnvNumber(envName: string, fallback: number): number {
    const value = process.env[envName];
    if (value === undefined) {
      return fallback;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      throw new InvalidGuildConfigError(
        `Environment variable ${envName} must be a finite number.`,
      );
    }

    return parsedValue;
  }

  private loadConfigs(): GuildConfigRecord {
    if (!existsSync(this.configFilePath)) {
      return {};
    }

    try {
      const rawContents = readFileSync(this.configFilePath, 'utf8');
      const parsed = JSON.parse(rawContents) as unknown;
      return this.parseConfigRecord(parsed);
    } catch (error: unknown) {
      logger.warn(
        `Failed to read ${this.configFilePath}. Resetting to empty config map.`,
      );
      logger.debug(`Config read error details: ${String(error)}`);
      return {};
    }
  }

  private parseConfigRecord(rawValue: unknown): GuildConfigRecord {
    if (!this.isPlainObject(rawValue)) {
      throw new InvalidGuildConfigError('Config file root must be an object.');
    }

    const parsedRecord: GuildConfigRecord = {};
    for (const [guildId, rawConfig] of Object.entries(rawValue)) {
      if (!this.isPlainObject(rawConfig)) {
        logger.warn(`Skipping invalid config for guild ${guildId}.`);
        continue;
      }

      const candidate: GuildConfig = {
        minInterval: rawConfig.minInterval,
        maxInterval: rawConfig.maxInterval,
        volume: rawConfig.volume,
      };

      try {
        this.validateGuildConfig(candidate);
        parsedRecord[guildId] = candidate;
      } catch (error: unknown) {
        logger.warn(`Skipping invalid config for guild ${guildId}.`);
        logger.debug(`Invalid guild config details: ${String(error)}`);
      }
    }

    return parsedRecord;
  }

  private persistConfigs(): void {
    try {
      mkdirSync(this.dataDirectory, { recursive: true });
      writeFileSync(this.configFilePath, JSON.stringify(this.configs, null, 2));
    } catch (error: unknown) {
      throw new ConfigPersistenceError(
        `Failed to persist guild configs to ${this.configFilePath}.`,
        error,
      );
    }
  }

  private validateGuildConfig(config: GuildConfig): void {
    const { minInterval, maxInterval, volume } = config;

    if (!Number.isFinite(minInterval) || minInterval <= 0) {
      throw new InvalidGuildConfigError(
        `Invalid minInterval (${minInterval}). Expected a finite number greater than 0.`,
      );
    }

    if (!Number.isFinite(maxInterval) || maxInterval < minInterval) {
      throw new InvalidGuildConfigError(
        `Invalid maxInterval (${maxInterval}). Expected a finite number greater than or equal to minInterval.`,
      );
    }

    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new InvalidGuildConfigError(
        `Invalid volume (${volume}). Expected a finite number between 0 and 1.`,
      );
    }
  }

  private isPlainObject(value: unknown): value is Record<string, number> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
