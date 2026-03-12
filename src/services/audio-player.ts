import {
  AudioPlayer,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { VoiceBasedChannel, VoiceState } from 'discord.js';
import * as logger from '../util/logger';

const DEFAULT_RECONNECT_TIMEOUT_MS = 5_000;

interface AudioPlayerServiceOptions {
  readonly autoDisconnectWhenAlone?: boolean;
  readonly reconnectTimeoutMs?: number;
}

export class VoiceConnectionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'VoiceConnectionError';
  }
}

export class AudioPlayerService {
  private readonly connections = new Map<string, VoiceConnection>();

  private readonly channelByGuildId = new Map<string, VoiceBasedChannel>();

  private readonly playerByGuildId = new Map<string, AudioPlayer>();

  private readonly autoDisconnectWhenAlone: boolean;

  private readonly reconnectTimeoutMs: number;

  constructor(options: AudioPlayerServiceOptions = {}) {
    this.autoDisconnectWhenAlone = options.autoDisconnectWhenAlone ?? false;
    this.reconnectTimeoutMs =
      options.reconnectTimeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS;
  }

  public async joinChannel(channel: VoiceBasedChannel): Promise<VoiceConnection> {
    const guildId = channel.guild.id;
    const existingConnection = this.connections.get(guildId);

    if (existingConnection !== undefined) {
      const currentChannelId = existingConnection.joinConfig.channelId;

      if (currentChannelId === channel.id) {
        logger.info(
          `Already connected to voice channel ${channel.id} in guild ${guildId}.`,
        );
        return existingConnection;
      }

      logger.info(
        `Moving voice connection in guild ${guildId} from channel ${currentChannelId} to ${channel.id}.`,
      );
      this.cleanupConnection(guildId, existingConnection);
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    this.connections.set(guildId, connection);
    this.channelByGuildId.set(guildId, channel);
    this.registerConnectionLifecycleHandlers(guildId, connection);

    try {
      await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        this.reconnectTimeoutMs,
      );
      logger.info(
        `Voice connection ready for guild ${guildId} in channel ${channel.id}.`,
      );
      return connection;
    } catch (error: unknown) {
      this.cleanupConnection(guildId, connection);
      throw new VoiceConnectionError(
        `Failed to join voice channel ${channel.id} in guild ${guildId}.`,
        error,
      );
    }
  }

  public leaveChannel(guildId: string): void {
    const connection = this.connections.get(guildId);

    if (connection === undefined) {
      logger.debug(`No voice connection to leave for guild ${guildId}.`);
      return;
    }

    logger.info(`Leaving voice channel in guild ${guildId}.`);
    this.cleanupConnection(guildId, connection);
  }

  public registerGuildAudioPlayer(guildId: string, player: AudioPlayer): void {
    this.playerByGuildId.set(guildId, player);
  }

  public getConnection(guildId: string): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  public handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
  ): void {
    if (!this.autoDisconnectWhenAlone) {
      return;
    }

    const guildId = newState.guild.id;
    const channel = this.channelByGuildId.get(guildId);

    if (channel === undefined) {
      return;
    }

    if (oldState.channelId !== channel.id && newState.channelId !== channel.id) {
      return;
    }

    this.maybeAutoDisconnect(guildId);
  }

  private registerConnectionLifecycleHandlers(
    guildId: string,
    connection: VoiceConnection,
  ): void {
    connection.on(VoiceConnectionStatus.Ready, () => {
      logger.info(
        `Voice connection status transitioned to Ready for guild ${guildId}.`,
      );
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      logger.warn(
        `Voice connection status transitioned to Disconnected for guild ${guildId}. Attempting reconnect.`,
      );
      void this.tryReconnect(guildId, connection);
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      logger.info(
        `Voice connection status transitioned to Destroyed for guild ${guildId}.`,
      );
      this.cleanupConnection(guildId, connection);
    });
  }

  private async tryReconnect(
    guildId: string,
    connection: VoiceConnection,
  ): Promise<void> {
    try {
      await Promise.race([
        entersState(
          connection,
          VoiceConnectionStatus.Signalling,
          this.reconnectTimeoutMs,
        ),
        entersState(
          connection,
          VoiceConnectionStatus.Connecting,
          this.reconnectTimeoutMs,
        ),
      ]);

      logger.info(`Reconnected voice connection for guild ${guildId}.`);
    } catch (error: unknown) {
      logger.error(
        `Failed to reconnect voice connection for guild ${guildId}. Cleaning up.`,
        error,
      );
      this.cleanupConnection(guildId, connection);
    }
  }

  private maybeAutoDisconnect(guildId: string): void {
    const channel = this.channelByGuildId.get(guildId);

    if (channel === undefined) {
      return;
    }

    const nonBotMemberCount = channel.members.filter((member) => {
      return !member.user.bot;
    }).size;

    if (nonBotMemberCount > 0) {
      return;
    }

    logger.info(
      `Auto-disconnect enabled and bot is alone in channel ${channel.id} (guild ${guildId}). Leaving channel.`,
    );
    this.leaveChannel(guildId);
  }

  private cleanupConnection(
    guildId: string,
    connection: VoiceConnection,
  ): void {
    const existingConnection = this.connections.get(guildId);

    if (existingConnection !== connection) {
      return;
    }

    this.connections.delete(guildId);
    this.channelByGuildId.delete(guildId);

    if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }

    const player = this.playerByGuildId.get(guildId);
    player?.stop(true);
    this.playerByGuildId.delete(guildId);
  }
}
