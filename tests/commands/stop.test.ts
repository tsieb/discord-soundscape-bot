import { describe, expect, it } from 'vitest';
import { createStopCommand } from '../../src/commands/stop';
import {
  createCommandDependenciesMock,
  createInteractionMock,
  createSessionMock,
} from '../helpers/command-mocks';

describe('stop command', () => {
  it('rejects usage outside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createStopCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ guildId: null });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
  });

  it('reports when playback is not running', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(undefined);

    const command = createStopCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith('Playback is not currently running.');
  });

  it('stops active playback', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(
      createSessionMock({ isPlaying: true }),
    );

    const command = createStopCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(sessionManager.stopPlayback).toHaveBeenCalledWith('guild-1');
    expect(reply).toHaveBeenCalledWith(
      'Stopped. Use `/start` to resume or `/leave` to disconnect.',
    );
  });
});
