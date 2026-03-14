import { Collection, PermissionFlagsBits } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../../src/client';
import { Command } from '../../src/types';

const createCommand = (executeImpl?: () => Promise<void>): Command => {
  return {
    data: { name: 'ping' } as never,
    execute: executeImpl ?? vi.fn().mockResolvedValue(undefined),
  };
};

describe('createClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes slash command interactions to matching handlers', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const commands = new Collection<string, Command>();
    commands.set('ping', createCommand(execute));

    const client = createClient(commands, {
      handleVoiceStateUpdate: vi.fn(),
    } as never, {
      handleVoiceStateUpdate: vi.fn(),
      hasSession: vi.fn(),
      destroySession: vi.fn(),
    } as never);

    const reply = vi.fn().mockResolvedValue(undefined);

    client.emit('interactionCreate', {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      appPermissions: {
        has: () => true,
      },
      commandName: 'ping',
      execute,
      reply,
      followUp: vi.fn(),
      replied: false,
      deferred: false,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(execute).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Unknown command. Try redeploying slash commands.' }),
    );
  });

  it('routes autocomplete interactions when the command supports them', async () => {
    const autocomplete = vi.fn().mockResolvedValue(undefined);
    const commands = new Collection<string, Command>();
    commands.set('ping', {
      data: { name: 'ping' } as never,
      execute: vi.fn().mockResolvedValue(undefined),
      autocomplete,
    });

    const client = createClient(commands, {
      handleVoiceStateUpdate: vi.fn(),
    } as never, {
      handleVoiceStateUpdate: vi.fn(),
      hasSession: vi.fn(),
      destroySession: vi.fn(),
    } as never);

    client.emit('interactionCreate', {
      isAutocomplete: () => true,
      isChatInputCommand: () => false,
      commandName: 'ping',
      respond: vi.fn(),
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(autocomplete).toHaveBeenCalledTimes(1);
  });

  it('rejects command execution when command channel permissions are missing', async () => {
    const commands = new Collection<string, Command>();
    commands.set('ping', createCommand());
    const client = createClient(commands, {
      handleVoiceStateUpdate: vi.fn(),
    } as never, {
      handleVoiceStateUpdate: vi.fn(),
      hasSession: vi.fn(),
      destroySession: vi.fn(),
    } as never);

    const reply = vi.fn().mockResolvedValue(undefined);

    client.emit('interactionCreate', {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      appPermissions: {
        has: (permission: bigint) => permission !== PermissionFlagsBits.EmbedLinks,
      },
      commandName: 'ping',
      reply,
      followUp: vi.fn(),
      replied: false,
      deferred: false,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(reply).toHaveBeenCalledWith({
      content:
        'I need the following permissions in this channel to respond: Embed Links. Please grant them and try again.',
      ephemeral: true,
    });
  });

  it('handles unknown commands with a user-facing message', async () => {
    const client = createClient(new Collection<string, Command>(), {
      handleVoiceStateUpdate: vi.fn(),
    } as never, {
      handleVoiceStateUpdate: vi.fn(),
      hasSession: vi.fn().mockReturnValue(false),
      destroySession: vi.fn(),
    } as never);

    const reply = vi.fn().mockResolvedValue(undefined);

    client.emit('interactionCreate', {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      appPermissions: { has: () => true },
      commandName: 'unknown',
      reply,
      followUp: vi.fn(),
      replied: false,
      deferred: false,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(reply).toHaveBeenCalledWith({
      content: 'Unknown command. Try redeploying slash commands.',
      ephemeral: true,
    });
  });

  it('sends followUp errors when a deferred/replied command fails', async () => {
    const failingExecute = vi.fn().mockRejectedValue(new Error('boom'));
    const commands = new Collection<string, Command>();
    commands.set('ping', createCommand(failingExecute));
    const client = createClient(commands, {
      handleVoiceStateUpdate: vi.fn(),
    } as never, {
      handleVoiceStateUpdate: vi.fn(),
      hasSession: vi.fn(),
      destroySession: vi.fn(),
    } as never);

    const followUp = vi.fn().mockResolvedValue(undefined);

    client.emit('interactionCreate', {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      appPermissions: { has: () => true },
      commandName: 'ping',
      reply: vi.fn(),
      followUp,
      replied: true,
      deferred: false,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(followUp).toHaveBeenCalledWith({
      content: 'An unexpected error occurred while running that command.',
      ephemeral: true,
    });
  });

  it('handles guild removal by destroying active sessions', () => {
    const destroySession = vi.fn();
    const hasSession = vi.fn().mockReturnValue(true);
    const client = createClient(new Collection<string, Command>(), {
      handleVoiceStateUpdate: vi.fn(),
    } as never, {
      handleVoiceStateUpdate: vi.fn(),
      hasSession,
      destroySession,
    } as never);

    client.emit('guildDelete', { id: 'guild-1' });

    expect(hasSession).toHaveBeenCalledWith('guild-1');
    expect(destroySession).toHaveBeenCalledWith('guild-1');
  });

  it('forwards voiceState updates to audio and session services', () => {
    const audioService = {
      handleVoiceStateUpdate: vi.fn(),
    };
    const sessionService = {
      handleVoiceStateUpdate: vi.fn(),
      hasSession: vi.fn(),
      destroySession: vi.fn(),
    };

    const client = createClient(new Collection<string, Command>(), audioService as never, sessionService as never);

    const oldState = { id: 'before' };
    const newState = { id: 'after' };

    client.emit('voiceStateUpdate', oldState, newState);

    expect(audioService.handleVoiceStateUpdate).toHaveBeenCalledWith(
      oldState,
      newState,
    );
    expect(sessionService.handleVoiceStateUpdate).toHaveBeenCalledWith(
      oldState,
      newState,
    );
  });
});
