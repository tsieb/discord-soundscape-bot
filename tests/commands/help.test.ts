import { describe, expect, it } from 'vitest';
import { createHelpCommand } from '../../src/commands/help';
import {
  createCommandDependenciesMock,
  createInteractionMock,
} from '../helpers/command-mocks';

describe('help command', () => {
  it('rejects usage outside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createHelpCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ guildId: null });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
  });

  it('responds with help embed inside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createHelpCommand(dependencies);
    const { interaction, reply } = createInteractionMock();

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledTimes(1);
    const [payload] = reply.mock.calls[0] as [{ embeds: { data: { title: string }[] } }];
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].data.title).toContain('Soundscape Bot Help');
  });
});
