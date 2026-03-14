import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createJoinCommand } from '../../src/commands/join';
import {
  createCommandDependenciesMock,
  createInteractionMock,
} from '../helpers/command-mocks';

const createGuildMemberMock = (voiceChannel: unknown): GuildMember => {
  const member = Object.create(GuildMember.prototype) as GuildMember;
  Object.defineProperty(member, 'voice', {
    value: { channel: voiceChannel },
    configurable: true,
  });
  return member;
};

const createVoiceChannelMock = (
  missingPermissions: bigint[] = [],
): {
  id: string;
  name: string;
  isVoiceBased: () => boolean;
  permissionsFor: () => { has: (permission: bigint) => boolean };
} => {
  return {
    id: 'voice-1',
    name: 'lobby',
    isVoiceBased: () => true,
    permissionsFor: () => ({
      has: (permission: bigint) => !missingPermissions.includes(permission),
    }),
  };
};

describe('join command', () => {
  it('rejects usage outside guilds', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createJoinCommand(dependencies);
    const { interaction, reply } = createInteractionMock({ guildId: null });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
  });

  it('requires caller to be in a voice channel', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createJoinCommand(dependencies);

    const guild = {
      members: {
        fetch: vi.fn().mockResolvedValue(createGuildMemberMock(null)),
        me: {},
      },
    };

    const { interaction, reply } = createInteractionMock({ guild });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content: 'You need to join a voice channel first.',
      ephemeral: true,
    });
  });

  it('requires bot member to resolve permissions', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createJoinCommand(dependencies);
    const voiceChannel = createVoiceChannelMock();

    const guild = {
      members: {
        fetch: vi.fn().mockResolvedValue(createGuildMemberMock(voiceChannel)),
        me: null,
      },
    };

    const { interaction, reply } = createInteractionMock({ guild });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content:
        'I could not verify my server permissions. Please try again in a moment.',
      ephemeral: true,
    });
  });

  it('reports missing voice permissions', async () => {
    const { dependencies } = createCommandDependenciesMock();
    const command = createJoinCommand(dependencies);
    const voiceChannel = createVoiceChannelMock([
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]);

    const guild = {
      members: {
        fetch: vi.fn().mockResolvedValue(createGuildMemberMock(voiceChannel)),
        me: {},
      },
    };

    const { interaction, reply } = createInteractionMock({ guild });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content:
        'I cannot join **#lobby** yet. Please grant me: Connect, Speak in that voice channel.',
      ephemeral: true,
    });
  });

  it('handles session creation failures', async () => {
    const { dependencies, sessionManager } = createCommandDependenciesMock();
    const command = createJoinCommand(dependencies);
    const voiceChannel = createVoiceChannelMock();

    sessionManager.createSession.mockRejectedValue(new Error('join failed'));

    const guild = {
      members: {
        fetch: vi.fn().mockResolvedValue(createGuildMemberMock(voiceChannel)),
        me: {},
      },
    };

    const { interaction, reply } = createInteractionMock({ guild });

    await command.execute(interaction);

    expect(reply).toHaveBeenCalledWith({
      content:
        'I could not join your voice channel. Please check my voice permissions and try again.',
      ephemeral: true,
    });
  });

  it('creates a session and confirms on success', async () => {
    const { dependencies, configService, sessionManager } =
      createCommandDependenciesMock();
    const command = createJoinCommand(dependencies);
    const voiceChannel = createVoiceChannelMock();

    configService.getConfig.mockReturnValue({
      minInterval: 20,
      maxInterval: 40,
      volume: 0.7,
    });
    sessionManager.createSession.mockResolvedValue({});

    const guild = {
      members: {
        fetch: vi.fn().mockResolvedValue(createGuildMemberMock(voiceChannel)),
        me: {},
      },
    };

    const { interaction, reply } = createInteractionMock({ guild });

    await command.execute(interaction);

    expect(configService.getConfig).toHaveBeenCalledWith('guild-1');
    expect(sessionManager.createSession).toHaveBeenCalledWith('guild-1', voiceChannel, {
      minInterval: 20,
      maxInterval: 40,
      volume: 0.7,
    });
    expect(reply).toHaveBeenCalledWith('Joined **#lobby**.');
  });
});
