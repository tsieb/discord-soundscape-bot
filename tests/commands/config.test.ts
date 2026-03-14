import { describe, expect, it } from 'vitest';
import { createConfigCommand } from '../../src/commands/config';
import {
  createAutocompleteInteractionMock,
  createCommandDependenciesMock,
  createInteractionMock,
} from '../helpers/command-mocks';

describe('config command', () => {
  it('rejects usage outside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ guildId: null });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
  });

  it('handles view subcommand', async () => {
    const { dependencies, configService } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ subcommand: 'view' });

    await command.execute(interaction);

    expect(configService.getConfig).toHaveBeenCalledWith('guild-1');
    expect(reply).toHaveBeenCalledTimes(1);
    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { title: string } }> }];
    expect(payload.embeds[0].data.title).toContain('Current Configuration');
  });

  it('requires at least one value for set', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ subcommand: 'set' });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'Provide at least one option to update.',
      ephemeral: true,
    });
  });

  it('validates minimum interval for set', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'set',
      integers: { min_interval: 4 },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'min_interval must be at least 5 seconds.',
      ephemeral: true,
    });
  });

  it('validates max interval is >= min interval', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'set',
      integers: { min_interval: 40, max_interval: 20 },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'max_interval must be greater than or equal to min_interval.',
      ephemeral: true,
    });
  });

  it('validates volume range for set', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommand: 'set',
      numbers: { volume: 1.2 },
    });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'volume must be between 0.0 and 1.0.',
      ephemeral: true,
    });
  });

  it('persists and applies set updates', async () => {
    const { dependencies, configService, sessionManager } =
      createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    configService.getConfig
      .mockReturnValueOnce({ minInterval: 30, maxInterval: 300, volume: 0.5 })
      .mockReturnValueOnce({ minInterval: 45, maxInterval: 120, volume: 0.75 });

    const { interaction, reply } = createInteractionMock({
      subcommand: 'set',
      integers: { min_interval: 45, max_interval: 120 },
      numbers: { volume: 0.75 },
    });

    await command.execute(interaction);

    expect(configService.setConfig).toHaveBeenCalledWith('guild-1', {
      minInterval: 45,
      maxInterval: 120,
      volume: 0.75,
    });
    expect(sessionManager.updateSessionConfig).toHaveBeenCalledWith('guild-1', {
      minInterval: 45,
      maxInterval: 120,
      volume: 0.75,
    });
    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { title: string } }> }];
    expect(payload.embeds[0].data.title).toContain('Configuration Updated');
  });

  it('resets config and updates active sessions', async () => {
    const { dependencies, configService, sessionManager } =
      createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    configService.resetConfig.mockReturnValue({
      minInterval: 30,
      maxInterval: 300,
      volume: 0.5,
    });

    const { interaction, reply } = createInteractionMock({ subcommand: 'reset' });

    await command.execute(interaction);

    expect(configService.resetConfig).toHaveBeenCalledWith('guild-1');
    expect(sessionManager.updateSessionConfig).toHaveBeenCalledWith('guild-1', {
      minInterval: 30,
      maxInterval: 300,
      volume: 0.5,
    });
    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { title: string } }> }];
    expect(payload.embeds[0].data.title).toContain('Configuration Reset');
  });

  it('applies a density preset', async () => {
    const { dependencies, densityCurveService } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommandGroup: 'density',
      subcommand: 'preset',
      strings: { name: 'bursty' },
    });

    await command.execute(interaction);

    expect(densityCurveService.applyPreset).toHaveBeenCalledWith('guild-1', 'bursty');
    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { title: string } }> }];
    expect(payload.embeds[0].data.title).toContain('Density Preset Applied');
  });

  it('shows density preset details and quantiles', async () => {
    const { dependencies, densityCurveService } = createCommandDependenciesMock();
    densityCurveService.getPresetName.mockReturnValue('ambient');
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommandGroup: 'density',
      subcommand: 'view',
    });

    await command.execute(interaction);

    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { title: string; fields: Array<{ name: string; value: string }> } }> }];
    expect(payload.embeds[0].data.title).toContain('Density Configuration');
    expect(payload.embeds[0].data.fields.some((field) => field.name === 'p50')).toBe(true);
  });

  it('resets density settings back to ambient', async () => {
    const { dependencies, densityCurveService } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, reply } = createInteractionMock({
      subcommandGroup: 'density',
      subcommand: 'reset',
    });

    await command.execute(interaction);

    expect(densityCurveService.applyPreset).toHaveBeenCalledWith('guild-1', 'ambient');
    const [payload] = reply.mock.calls[0] as [{ embeds: Array<{ data: { title: string } }> }];
    expect(payload.embeds[0].data.title).toContain('Density Reset');
  });

  it('autocompletes density preset names', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createConfigCommand(dependencies);
    const { interaction, respond } = createAutocompleteInteractionMock({
      commandName: 'config',
      subcommandGroup: 'density',
      subcommand: 'preset',
      focused: 'sp',
    });

    await command.autocomplete?.(interaction);

    expect(respond).toHaveBeenCalledWith([
      {
        name: 'Sparse',
        value: 'sparse',
      },
    ]);
  });
});
