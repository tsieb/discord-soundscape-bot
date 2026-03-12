const DEBUG_LOG_LEVEL = 'debug';

const shouldLogDebug = (): boolean => {
  return process.env.LOG_LEVEL?.toLowerCase() === DEBUG_LOG_LEVEL;
};

const formatLogMessage = (level: string, message: string): string => {
  const timestamp = new Date().toISOString();
  return `[${level}] ${timestamp} ${message}`;
};

export const info = (message: string): void => {
  console.log(formatLogMessage('INFO', message));
};

export const warn = (message: string): void => {
  console.warn(formatLogMessage('WARN', message));
};

export const error = (message: string, err?: unknown): void => {
  console.error(formatLogMessage('ERROR', message), err);
};

export const debug = (message: string): void => {
  if (!shouldLogDebug()) {
    return;
  }

  console.debug(formatLogMessage('DEBUG', message));
};
