import { AudioPlayer, createAudioPlayer } from '@discordjs/voice';
import { VoiceBasedChannel } from 'discord.js';
import { AudioPlayerService } from './audio-player';
import { Scheduler } from './scheduler';
import { SoundLibrary } from './sound-library';
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
        const sound = this.soundLibrary.getRandomSound();
        logger.info(
          `Guild ${guildId} playing sound "${sound.name}" from ${sound.path}.`,
        );
        if (session === null) {
          return;
        }

        await this.audioPlayerService.playSound(
          guildId,
          sound.path,
          session.config.volume,
        );
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
