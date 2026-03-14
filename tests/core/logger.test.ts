import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as logger from '../../src/util/logger';

describe('logger', () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it('logs info/warn/error with prefixes', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.info('hello');
    logger.warn('watch out');
    logger.error('bad');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'), undefined);
  });

  it('logs debug only when LOG_LEVEL=debug', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    process.env.LOG_LEVEL = 'info';
    logger.debug('hidden');
    expect(debugSpy).not.toHaveBeenCalled();

    process.env.LOG_LEVEL = 'debug';
    logger.debug('visible');
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
  });
});
