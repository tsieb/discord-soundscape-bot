import { describe, expect, it } from 'vitest';
import { createLeaveCommand } from '../../src/commands/leave';
import {
  createCommandDependenciesMock,
  createInteractionMock,
} from '../helpers/command-mocks';

describe('leave command', () => {
  it('rejects usage outside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createLeaveCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ guildId: null });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
  });

  it('reports when no session exists', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.hasSession.mockReturnValue(false);

    const command = createLeaveCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith('I am not connected to a voice channel.');
    expect(sessionManager.destroySession).not.toHaveBeenCalled();
  });

  it('destroys existing session', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.hasSession.mockReturnValue(true);

    const command = createLeaveCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(sessionManager.destroySession).toHaveBeenCalledWith('guild-1');
    expect(reply).toHaveBeenCalledWith('Left the voice channel.');
  });
});
