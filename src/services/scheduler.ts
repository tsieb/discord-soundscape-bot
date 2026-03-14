import * as logger from '../util/logger';

type SchedulerTickHandler = () => void | Promise<void>;

export class InvalidSchedulerConfigError extends Error {
  constructor(minInterval: number, maxInterval: number) {
    super(
      `Invalid scheduler interval range: min=${minInterval}, max=${maxInterval}. Expected min > 0 and max >= min.`,
    );
    this.name = 'InvalidSchedulerConfigError';
  }
}

export class Scheduler {
  private minInterval: number;

  private maxInterval: number;

  private readonly onTick: SchedulerTickHandler;

  private timeout: NodeJS.Timeout | null = null;

  private running = false;

  private nextPlayTime: number | null = null;

  private sampleFn: (() => number) | null;

  constructor(
    minInterval: number,
    maxInterval: number,
    onTick: SchedulerTickHandler,
    sampleFn: (() => number) | null = null,
  ) {
    Scheduler.validateIntervals(minInterval, maxInterval);
    this.minInterval = minInterval;
    this.maxInterval = maxInterval;
    this.onTick = onTick;
    this.sampleFn = sampleFn;
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleNextTick();
  }

  public stop(): void {
    this.running = false;

    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    this.nextPlayTime = null;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public updateConfig(
    min: number,
    max: number,
    sampleFn: (() => number) | null = this.sampleFn,
  ): void {
    Scheduler.validateIntervals(min, max);
    this.minInterval = min;
    this.maxInterval = max;
    this.sampleFn = sampleFn;
  }

  public getNextPlayTime(): number | null {
    return this.nextPlayTime;
  }

  private scheduleNextTick(): void {
    if (!this.running) {
      return;
    }

    const delayMs = this.calculateRandomDelayMs();
    this.nextPlayTime = Date.now() + delayMs;
    this.timeout = setTimeout(() => {
      void this.runTick();
    }, delayMs);
  }

  private async runTick(): Promise<void> {
    this.timeout = null;
    this.nextPlayTime = null;

    try {
      await this.onTick();
    } catch (error: unknown) {
      logger.error('Scheduler tick failed. Continuing to next interval.', error);
    }

    if (!this.running) {
      return;
    }

    this.scheduleNextTick();
  }

  private calculateRandomDelayMs(): number {
    const sampledDelaySeconds =
      this.sampleFn?.() ??
      (this.minInterval + Math.random() * (this.maxInterval - this.minInterval));
    const clampedDelaySeconds = Math.min(
      this.maxInterval,
      Math.max(this.minInterval, sampledDelaySeconds),
    );

    return Math.max(1, Math.round(clampedDelaySeconds * 1000));
  }

  private static validateIntervals(min: number, max: number): void {
    if (min > 0 && max >= min) {
      return;
    }

    throw new InvalidSchedulerConfigError(min, max);
  }
}
