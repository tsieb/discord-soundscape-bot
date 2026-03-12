import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'discord.js';
import { createClient } from './client';
import * as logger from './util/logger';

dotenv.config();

const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'CLIENT_ID'] as const;
const execFileAsync = promisify(execFile);

const getMissingEnvVars = (): string[] => {
  return REQUIRED_ENV_VARS.filter((envVarName) => {
    return !process.env[envVarName];
  });
};

const validateRequiredEnvVars = (): void => {
  const missingEnvVars = getMissingEnvVars();

  if (missingEnvVars.length === 0) {
    return;
  }

  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}`,
  );
};

const validateFfmpegAvailability = async (): Promise<void> => {
  try {
    await execFileAsync('ffmpeg', ['-version']);
  } catch (error: unknown) {
    const instructions =
      'FFmpeg is required for voice playback but was not found in PATH. Install FFmpeg and ensure the ffmpeg executable is available. Download: https://ffmpeg.org/download.html';
    throw new Error(instructions, error === undefined ? undefined : { cause: error });
  }
};

const setupGracefulShutdown = (client: Client): void => {
  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

export const startBot = async (): Promise<void> => {
  validateRequiredEnvVars();
  await validateFfmpegAvailability();

  const client = createClient();
  setupGracefulShutdown(client);
  await client.login(process.env.DISCORD_TOKEN);
};

void startBot().catch((error: unknown) => {
  logger.error('Failed to start bot.', error);
  process.exit(1);
});
