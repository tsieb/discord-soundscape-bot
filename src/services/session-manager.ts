import { AudioPlayer, createAudioPlayer } from '@discordjs/voice';
import { VoiceBasedChannel, VoiceState } from 'discord.js';
import { AudioPlaybackError, AudioPlayerService } from './audio-player';
import { Scheduler } from './scheduler';
import { EmptySoundLibraryError, SoundLibrary } from './sound-library';
import { GuildConfig, Session } from '../types';
import * as logger from '../util/logger';

export class SessionNotFoundError extends Error {
  constructor(guildId: string) {
    super(`No active session found for guild ${guildId}.`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly audioPlayerService: AudioPlayerService,
    private readonly soundLibrary: SoundLibrary,
  ) {}

  public async createSession(
    guildId: string,
    channel: VoiceBasedChannel,
    config: GuildConfig,
  ): Promise<Session> {
    const existingSession = this.sessions.get(guildId);
    if (existingSession !== undefined) {
      this.destroySession(guildId);
    }

    const voiceConnection = await this.audioPlayerService.joinChannel(channel);
    const audioPlayer = this.createGuildAudioPlayer(guildId);
    let session: Session | null = null;

    const scheduler = new Scheduler(
      config.minInterval,
      config.maxInterval,
      async () => {
        if (session === null) {
          return;
        }

        const activeSession = session;
        let soundPath = '';
        let soundName = '';

        try {
          const sound = this.soundLibrary.getRandomSound();
          soundPath = sound.path;
          soundName = sound.name;
        } catch (error: unknown) {
          if (error instanceof EmptySoundLibraryError) {
            activeSession.scheduler.stop();
            activeSession.isPlaying = false;
            logger.warn(
              `Sound library is empty in guild ${guildId}. Stopping scheduler until sounds are added.`,
            );
            return;
          }

          throw error;
        }

        logger.info(
          `Guild ${guildId} playing sound "${soundName}" from ${soundPath}.`,
        );

        try {
          await this.audioPlayerService.playSound(
            guildId,
            soundPath,
            activeSession.config.volume,
          );
        } catch (error: unknown) {
          if (error instanceof AudioPlaybackError) {
            logger.warn(
              `Skipping unplayable sound "${soundName}" in guild ${guildId}. Scheduler will continue.`,
            );
            logger.debug(`Audio playback error details: ${String(error)}`);
            return;
          }

          throw error;
        }
      },
    );

    const createdSession: Session = {
      guildId,
      channelId: channel.id,
      voiceConnection,
      audioPlayer,
      scheduler,
      config: {
        ...config,
      },
      isPlaying: false,
    };
    session = createdSession;

    this.sessions.set(guildId, createdSession);
    logger.info(`Created session for guild ${guildId} in channel ${channel.id}.`);

    return createdSession;
  }

  public destroySession(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return;
    }

    session.scheduler.stop();
    session.audioPlayer.stop(true);
    this.audioPlayerService.leaveChannel(guildId);
    this.sessions.delete(guildId);

    logger.info(`Destroyed session for guild ${guildId}.`);
  }

  public getSession(guildId: string): Session | undefined {
    return this.sessions.get(guildId);
  }

  public hasSession(guildId: string): boolean {
    return this.sessions.has(guildId);
  }

  public destroyAllSessions(): void {
    const guildIds = Array.from(this.sessions.keys());
    for (const guildId of guildIds) {
      this.destroySession(guildId);
    }
  }

  public handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
  ): void {
    const botUserId = newState.client.user?.id;
    if (botUserId === undefined || newState.id !== botUserId) {
      return;
    }

    const guildId = newState.guild.id;
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return;
    }

    if (newState.channelId === null) {
      logger.warn(
        `Bot left voice unexpectedly in guild ${guildId}. Destroying active session.`,
      );
      this.destroySession(guildId);
      return;
    }

    if (oldState.channelId !== newState.channelId) {
      session.channelId = newState.channelId;
      logger.info(
        `Bot moved voice channels in guild ${guildId}. Updated session channel to ${newState.channelId}.`,
      );
    }
  }

  public startPlayback(guildId: string): void {
    const session = this.getRequiredSession(guildId);
    session.scheduler.start();
    session.isPlaying = true;
    logger.info(`Started scheduled playback for guild ${guildId}.`);
  }

  public stopPlayback(guildId: string): void {
    const session = this.getRequiredSession(guildId);
    session.scheduler.stop();
    session.isPlaying = false;
    logger.info(`Stopped scheduled playback for guild ${guildId}.`);
  }

  public updateSessionConfig(guildId: string, config: GuildConfig): void {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return;
    }

    session.config = { ...config };
    session.scheduler.updateConfig(config.minInterval, config.maxInterval);
    logger.info(`Updated active session config for guild ${guildId}.`);
  }

  public async playSoundNow(guildId: string, soundPath: string): Promise<void> {
    const session = this.getRequiredSession(guildId);
    await this.audioPlayerService.playSound(guildId, soundPath, session.config.volume);
    logger.info(`Played manual sound in guild ${guildId}: ${soundPath}.`);
  }

  private createGuildAudioPlayer(guildId: string): AudioPlayer {
    const player = createAudioPlayer();
    this.audioPlayerService.registerGuildAudioPlayer(guildId, player);
    return player;
  }

  private getRequiredSession(guildId: string): Session {
    const session = this.sessions.get(guildId);
    if (session !== undefined) {
      return session;
    }

    throw new SessionNotFoundError(guildId);
  }
}
