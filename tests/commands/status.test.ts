import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStatusCommand } from '../../src/commands/status';
import {
  createCommandDependenciesMock,
  createInteractionMock,
  createSessionMock,
} from '../helpers/command-mocks';

describe('status command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects usage outside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createStatusCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ guildId: null });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
  });

  it('shows idle status when no session exists', async () => {
    const { dependencies, sessionManager, configService, soundConfigService } =
      createCommandDependenciesMock();
    const now = new Date('2026-03-12T12:10:00.000Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    sessionManager.getSession.mockReturnValue(undefined);
    configService.getConfig.mockReturnValue({
      minInterval: 30,
      maxInterval: 300,
      volume: 0.5,
    });
    soundConfigService.getAllSoundConfigs.mockReturnValue(new Map());

    const command = createStatusCommand({
      ...dependencies,
      startedAt: new Date('2026-03-12T12:00:00.000Z'),
    });
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { description: string; fields: Array<{ name: string; value: string }> } }> }];
    expect(payload.embeds[0].data.description).toContain('currently idle');
    expect(payload.embeds[0].data.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Connected Channel',
          value: 'Not connected',
        }),
        expect.objectContaining({ name: 'Playback', value: 'Stopped' }),
        expect.objectContaining({
          name: 'Per-Sound Overrides',
          value: 'None active',
        }),
        expect.objectContaining({ name: 'Uptime', value: '10m 0s' }),
      ]),
    );
  });

  it('shows active session details when playing', async () => {
    const { dependencies, sessionManager, soundLibrary, soundConfigService } =
      createCommandDependenciesMock();
    const nextPlay = new Date('2026-03-12T12:01:30.000Z').getTime();
    sessionManager.getEarliestNextPlayTime.mockReturnValue(nextPlay);
    sessionManager.getSoundTimerCount.mockReturnValue(12);
    soundConfigService.getAllSoundConfigs.mockReturnValue(
      new Map([
        ['rain', { volume: 1.2, weight: 1, enabled: true }],
        ['thunder', { volume: 1.4, weight: 0.2, enabled: true }],
      ]),
    );

    sessionManager.getSession.mockReturnValue(
      createSessionMock({
        channelId: 'voice-99',
        isPlaying: true,
        config: {
          minInterval: 60,
          maxInterval: 180,
          volume: 0.2,
        },
      }),
    );
    soundLibrary.getSoundCount.mockReturnValue(12);

    const command = createStatusCommand({
      ...dependencies,
      startedAt: new Date('2026-03-12T12:00:00.000Z'),
    });
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { fields: Array<{ name: string; value: string }> } }> }];
    expect(payload.embeds[0].data.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Connected Channel',
          value: '<#voice-99>',
        }),
        expect.objectContaining({ name: 'Playback', value: 'Active' }),
        expect.objectContaining({ name: 'Sound Library', value: '12 sound(s)' }),
        expect.objectContaining({
          name: 'Per-Sound Overrides',
          value: '2 configured sound(s)',
        }),
        expect.objectContaining({ name: 'Active Timers', value: '12' }),
        expect.objectContaining({
          name: 'Config',
          value: 'Interval: 1m - 3m\nVolume: 20%',
        }),
        expect.objectContaining({
          name: 'Next Sound ETA',
          value: `<t:${Math.floor(nextPlay / 1000)}:R>`,
        }),
      ]),
    );
  });
});
