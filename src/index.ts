import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'CLIENT_ID'] as const;

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

const setupGracefulShutdown = (client: Client): void => {
  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`[INFO] Received ${signal}. Shutting down gracefully...`);

    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

export const startBot = async (): Promise<void> => {
  validateRequiredEnvVars();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  setupGracefulShutdown(client);
  await client.login(process.env.DISCORD_TOKEN);
};

void startBot().catch((error: unknown) => {
  console.error('[ERROR] Failed to start bot:', error);
  process.exit(1);
});
