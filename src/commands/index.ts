import { Collection, REST, Routes } from 'discord.js';
import { Command } from '../types';
import * as logger from '../util/logger';
import { configCommandData, createConfigCommand } from './config';
import { createHelpCommand, helpCommandData } from './help';
import { createJoinCommand, joinCommandData } from './join';
import { createLeaveCommand, leaveCommandData } from './leave';
import { createSoundsCommand, soundsCommandData } from './sounds';
import { createStartCommand, startCommandData } from './start';
import { createStatusCommand, statusCommandData } from './status';
import { createStopCommand, stopCommandData } from './stop';
import { CommandDependencies } from './types';

const REQUIRED_DEPLOY_ENV_VARS = ['DISCORD_TOKEN', 'CLIENT_ID'] as const;

const getMissingDeployEnvVars = (): string[] => {
  return REQUIRED_DEPLOY_ENV_VARS.filter((envVarName) => {
    return !process.env[envVarName];
  });
};

const getDeploymentTargetDescription = (guildId?: string): string => {
  if (guildId === undefined || guildId === '') {
    return 'global commands';
  }

  return `guild commands for guild ${guildId}`;
};

export const getCommandData = (): Command['data'][] => {
  return [
    helpCommandData,
    configCommandData,
    joinCommandData,
    leaveCommandData,
    soundsCommandData,
    startCommandData,
    stopCommandData,
    statusCommandData,
  ];
};

export const getCommands = (
  dependencies: CommandDependencies,
): Collection<string, Command> => {
  const commands = new Collection<string, Command>();

  const commandList: Command[] = [
    createHelpCommand(dependencies),
    createConfigCommand(dependencies),
    createJoinCommand(dependencies),
    createLeaveCommand(dependencies),
    createSoundsCommand(dependencies),
    createStartCommand(dependencies),
    createStopCommand(dependencies),
    createStatusCommand(dependencies),
  ];

  for (const command of commandList) {
    commands.set(command.data.name, command);
  }

  return commands;
};

export const deployCommands = async (): Promise<void> => {
  const missingEnvVars = getMissingDeployEnvVars();
  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables for command deployment: ${missingEnvVars.join(', ')}`,
    );
  }

  const token = process.env.DISCORD_TOKEN as string;
  const clientId = process.env.CLIENT_ID as string;
  const guildId = process.env.GUILD_ID;

  const payload = getCommandData().map((commandData) => commandData.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);

  logger.info(
    `Deploying ${payload.length} command(s) to ${getDeploymentTargetDescription(guildId)}.`,
  );

  if (guildId !== undefined && guildId !== '') {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: payload,
    });
    logger.info(`Successfully deployed commands to guild ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: payload });
  logger.info('Successfully deployed global commands.');
};
