import { describe, expect, it } from 'vitest';
import { createStartCommand } from '../../src/commands/start';
import {
  createCommandDependenciesMock,
  createInteractionMock,
  createSessionMock,
} from '../helpers/command-mocks';

describe('start command', () => {
  it('rejects usage outside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createStartCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ guildId: null });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
  });

  it('requires an active session', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(undefined);

    const command = createStartCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'No active session found. Use `/join` first.',
      ephemeral: true,
    });
  });

  it('reports when already playing', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(
      createSessionMock({ isPlaying: true }),
    );

    const command = createStartCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith('Playback is already running.');
    expect(sessionManager.startPlayback).not.toHaveBeenCalled();
  });

  it('starts playback for existing idle sessions', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(
      createSessionMock({
        isPlaying: false,
        config: {
          minInterval: 30,
          maxInterval: 300,
          volume: 0.5,
        },
      }),
    );

    const command = createStartCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(sessionManager.startPlayback).toHaveBeenCalledWith('guild-1');
    expect(sessionManager.getSoundTimerCount).toHaveBeenCalledWith('guild-1');
    expect(reply).toHaveBeenCalledWith(
      'Started! 1 independent timer is running in the **30s - 5m** range.',
    );
  });

  it('reports when playback cannot start because no sounds are available', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    sessionManager.getSession.mockReturnValue(createSessionMock({ isPlaying: false }));
    sessionManager.startPlayback.mockReturnValue(false);

    const command = createStartCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content:
        'No sounds are available right now. Add sounds with `/sounds add` and try `/start` again.',
      ephemeral: true,
    });
  });
});
