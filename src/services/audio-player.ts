import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { VoiceBasedChannel, VoiceState } from 'discord.js';
import * as logger from '../util/logger';

const DEFAULT_RECONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;
const DEFAULT_INITIAL_RECONNECT_DELAY_MS = 1_000;

interface AudioPlayerServiceOptions {
  readonly autoDisconnectWhenAlone?: boolean;
  readonly reconnectTimeoutMs?: number;
  readonly maxReconnectAttempts?: number;
  readonly initialReconnectDelayMs?: number;
}

export class VoiceConnectionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'VoiceConnectionError';
  }
}

export class AudioPlaybackError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AudioPlaybackError';
  }
}
export class AudioPlayerService {
  private readonly connections = new Map<string, VoiceConnection>();

  private readonly channelByGuildId = new Map<string, VoiceBasedChannel>();

  private readonly playerByGuildId = new Map<string, AudioPlayer>();

  private readonly autoDisconnectWhenAlone: boolean;

  private readonly reconnectTimeoutMs: number;

  private readonly maxReconnectAttempts: number;

  private readonly initialReconnectDelayMs: number;

  private readonly reconnectInProgressGuildIds = new Set<string>();

  private readonly warnedSilencedGuildIds = new Set<string>();

  constructor(options: AudioPlayerServiceOptions = {}) {
    this.autoDisconnectWhenAlone = options.autoDisconnectWhenAlone ?? false;
    this.reconnectTimeoutMs =
      options.reconnectTimeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS;
    this.maxReconnectAttempts =
      options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.initialReconnectDelayMs =
      options.initialReconnectDelayMs ?? DEFAULT_INITIAL_RECONNECT_DELAY_MS;
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
    this.registerAudioPlayerLifecycleHandlers(guildId, player);
  }

  public getConnection(guildId: string): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  public handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
  ): void {
    const botUserId = newState.client.user?.id;
    if (botUserId !== undefined && newState.id === botUserId) {
      this.handleBotVoiceStateUpdate(newState);
    }

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

  public async playSound(
    guildId: string,
    filePath: string,
    volume: number,
    volumeMultiplier = 1,
  ): Promise<void> {
    const connection = this.connections.get(guildId);

    if (connection === undefined) {
      throw new AudioPlaybackError(
        `Cannot play sound in guild ${guildId}: no active voice connection.`,
      );
    }

    const player = this.getOrCreatePlayer(guildId);
    const effectiveVolume = volume * volumeMultiplier;
    const resource = this.createResource(filePath, effectiveVolume);
    connection.subscribe(player);

    logger.info(
      `Starting playback for guild ${guildId}: ${filePath} (volume=${effectiveVolume}).`,
    );

    return new Promise<void>((resolve, reject) => {
      const onIdle = (): void => {
        cleanupListeners();
        logger.info(`Playback finished for guild ${guildId}: ${filePath}.`);
        resolve();
      };

      const onError = (error: Error): void => {
        cleanupListeners();
        reject(
          new AudioPlaybackError(
            `Playback failed in guild ${guildId} for file ${filePath}.`,
            error,
          ),
        );
      };

      const cleanupListeners = (): void => {
        player.off(AudioPlayerStatus.Idle, onIdle);
        player.off('error', onError);
      };

      player.on(AudioPlayerStatus.Idle, onIdle);
      player.on('error', onError);
      player.play(resource);
    });
  }

  private getOrCreatePlayer(guildId: string): AudioPlayer {
    const existingPlayer = this.playerByGuildId.get(guildId);

    if (existingPlayer !== undefined) {
      return existingPlayer;
    }

    const player = createAudioPlayer();
    this.playerByGuildId.set(guildId, player);
    this.registerAudioPlayerLifecycleHandlers(guildId, player);
    return player;
  }

  private createResource(filePath: string, volume: number): AudioResource {
    const resource = createAudioResource(filePath, {
      inlineVolume: true,
    });
    resource.volume?.setVolume(volume);
    return resource;
  }

  private registerAudioPlayerLifecycleHandlers(
    guildId: string,
    player: AudioPlayer,
  ): void {
    player.on(AudioPlayerStatus.Playing, () => {
      logger.info(`Audio player status transitioned to Playing for guild ${guildId}.`);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      logger.info(`Audio player status transitioned to Idle for guild ${guildId}.`);
    });

    player.on(AudioPlayerStatus.AutoPaused, () => {
      logger.warn(
        `Audio player status transitioned to AutoPaused for guild ${guildId}.`,
      );
    });

    player.on('error', (error: Error) => {
      logger.error(`Audio player error for guild ${guildId}.`, error);
    });
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
      if (this.connections.get(guildId) !== connection) {
        return;
      }

      logger.warn(
        `Voice connection status transitioned to Disconnected for guild ${guildId}.`,
      );
      void this.tryReconnectWithBackoff(guildId, connection);
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      logger.info(
        `Voice connection status transitioned to Destroyed for guild ${guildId}.`,
      );
      this.cleanupConnection(guildId, connection);
    });
  }

  private async tryReconnectWithBackoff(
    guildId: string,
    connection: VoiceConnection,
  ): Promise<void> {
    if (this.reconnectInProgressGuildIds.has(guildId)) {
      return;
    }

    this.reconnectInProgressGuildIds.add(guildId);

    try {
      for (let attempt = 1; attempt <= this.maxReconnectAttempts; attempt += 1) {
        if (this.connections.get(guildId) !== connection) {
          return;
        }

        const delayMs =
          this.initialReconnectDelayMs * 2 ** Math.max(0, attempt - 1);
        logger.warn(
          `Reconnect attempt ${attempt}/${this.maxReconnectAttempts} for guild ${guildId} in ${delayMs}ms.`,
        );
        await this.wait(delayMs);

        if (this.connections.get(guildId) !== connection) {
          return;
        }

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
            entersState(
              connection,
              VoiceConnectionStatus.Ready,
              this.reconnectTimeoutMs,
            ),
          ]);

          logger.info(
            `Reconnected voice connection for guild ${guildId} on attempt ${attempt}.`,
          );
          return;
        } catch (error: unknown) {
          logger.warn(
            `Reconnect attempt ${attempt} failed for guild ${guildId}.`,
          );
          logger.debug(`Reconnect error details: ${String(error)}`);
        }
      }

      logger.error(
        `Failed to reconnect voice connection for guild ${guildId} after ${this.maxReconnectAttempts} attempts. Cleaning up.`,
      );
      this.cleanupConnection(guildId, connection);
    } finally {
      this.reconnectInProgressGuildIds.delete(guildId);
    }
  }

  private handleBotVoiceStateUpdate(newState: VoiceState): void {
    const guildId = newState.guild.id;

    if (newState.channel !== null) {
      this.channelByGuildId.set(guildId, newState.channel);
    } else {
      this.channelByGuildId.delete(guildId);
    }

    const isSilenced = newState.serverDeaf || newState.serverMute;
    if (isSilenced && !this.warnedSilencedGuildIds.has(guildId)) {
      logger.warn(
        `Bot is server-muted or server-deafened in guild ${guildId}. Scheduling continues, but users will not hear sounds until unmuted/undeafened.`,
      );
      this.warnedSilencedGuildIds.add(guildId);
      return;
    }

    if (!isSilenced && this.warnedSilencedGuildIds.has(guildId)) {
      logger.info(`Bot is no longer server-muted/deafened in guild ${guildId}.`);
      this.warnedSilencedGuildIds.delete(guildId);
    }
  }

  private async wait(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
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
    this.reconnectInProgressGuildIds.delete(guildId);
    this.warnedSilencedGuildIds.delete(guildId);

    if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }

    const player = this.playerByGuildId.get(guildId);
    player?.stop(true);
    this.playerByGuildId.delete(guildId);
  }
}
