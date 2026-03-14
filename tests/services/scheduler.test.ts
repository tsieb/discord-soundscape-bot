import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidSchedulerConfigError,
  Scheduler,
} from '../../src/services/scheduler';
import * as logger from '../../src/util/logger';

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('validates constructor interval bounds', () => {
    expect(() => new Scheduler(0, 10, vi.fn())).toThrow(InvalidSchedulerConfigError);
    expect(() => new Scheduler(10, 5, vi.fn())).toThrow(InvalidSchedulerConfigError);
  });

  it('starts and schedules ticks', async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(1, 1, onTick);

    scheduler.start();

    expect(scheduler.isRunning()).toBe(true);
    expect(scheduler.getNextPlayTime()).toBe(
      new Date('2026-03-12T00:00:01.000Z').getTime(),
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(scheduler.getNextPlayTime()).toBe(
      new Date('2026-03-12T00:00:02.000Z').getTime(),
    );
  });

  it('stops and clears pending state', () => {
    const scheduler = new Scheduler(1, 1, vi.fn());

    scheduler.start();
    scheduler.stop();

    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.getNextPlayTime()).toBeNull();
  });

  it('applies updated config on subsequent ticks', async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(1, 1, onTick);

    scheduler.start();
    scheduler.updateConfig(2, 2);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(scheduler.getNextPlayTime()).toBe(
      new Date('2026-03-12T00:00:03.000Z').getTime(),
    );
  });

  it('keeps scheduling after tick failures', async () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const onTick = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const scheduler = new Scheduler(1, 1, onTick);

    scheduler.start();

    await vi.advanceTimersByTimeAsync(2_000);

    expect(onTick).toHaveBeenCalledTimes(2);
    expect(loggerSpy).toHaveBeenCalledWith(
      'Scheduler tick failed. Continuing to next interval.',
      expect.any(Error),
    );
  });

  it('does not schedule next tick after stop during active run', async () => {
    let resolveTick: (() => void) | undefined;
    const onTick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTick = resolve;
        }),
    );

    const scheduler = new Scheduler(1, 1, onTick);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1_000);
    scheduler.stop();
    resolveTick?.();
    await vi.runAllTimersAsync();

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.getNextPlayTime()).toBeNull();
  });
});
