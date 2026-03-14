import { Collection, REST, Routes } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deployCommands, getCommandData, getCommands } from '../../src/commands';
import { createCommandDependenciesMock } from '../helpers/command-mocks';

const ORIGINAL_ENV = { ...process.env };

describe('commands index', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('returns command data for all slash commands', () => {
    const commandData = getCommandData();

    const commandNames = commandData.map((command) => command.name);
    expect(commandNames).toEqual([
      'help',
      'config',
      'join',
      'leave',
      'sounds',
      'start',
      'stop',
      'status',
    ]);
  });

  it('builds command map with executable handlers', () => {
    const { dependencies } = createCommandDependenciesMock();

    const commands = getCommands(dependencies);

    expect(commands).toBeInstanceOf(Collection);
    expect(Array.from(commands.keys())).toEqual([
      'help',
      'config',
      'join',
      'leave',
      'sounds',
      'start',
      'stop',
      'status',
    ]);
  });

  it('requires deployment env vars', async () => {
    delete process.env.DISCORD_TOKEN;
    delete process.env.CLIENT_ID;

    await expect(deployCommands()).rejects.toThrow(
      'Missing required environment variables for command deployment: DISCORD_TOKEN, CLIENT_ID',
    );
  });

  it('deploys commands to a guild when GUILD_ID is present', async () => {
    process.env.DISCORD_TOKEN = 'token';
    process.env.CLIENT_ID = 'client';
    process.env.GUILD_ID = 'guild';

    const putSpy = vi.spyOn(REST.prototype, 'put').mockResolvedValue({});

    await deployCommands();

    expect(putSpy).toHaveBeenCalledWith(
      Routes.applicationGuildCommands('client', 'guild'),
      expect.objectContaining({ body: expect.any(Array) }),
    );
  });

  it('deploys commands globally when GUILD_ID is missing', async () => {
    process.env.DISCORD_TOKEN = 'token';
    process.env.CLIENT_ID = 'client';
    delete process.env.GUILD_ID;

    const putSpy = vi.spyOn(REST.prototype, 'put').mockResolvedValue({});

    await deployCommands();

    expect(putSpy).toHaveBeenCalledWith(
      Routes.applicationCommands('client'),
      expect.objectContaining({ body: expect.any(Array) }),
    );
  });
});
