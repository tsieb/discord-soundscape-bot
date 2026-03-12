import dotenv from 'dotenv';
import { deployCommands } from './commands';
import * as logger from './util/logger';

dotenv.config();

export const runCommandDeployment = async (): Promise<void> => {
  await deployCommands();
};

void runCommandDeployment()
  .then(() => {
    logger.info('Command deployment completed successfully.');
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error('Command deployment failed.', error);
    process.exit(1);
  });
