import { EventEmitter } from 'node:events';
import { AudioPlayer, createAudioPlayer } from '@discordjs/voice';
import { VoiceBasedChannel, VoiceState } from 'discord.js';
import { DensityCurveService } from './density-curve-service';
import { AudioPlaybackError, AudioPlayerService } from './audio-player';
import { Scheduler } from './scheduler';
import { SoundConfigService } from './sound-config-service';
import { SoundLibrary } from './sound-library';
import {
  GuildConfig,
  Session,
  SessionPlaybackEvent,
  SessionSnapshot,
  SoundConfig,
  SoundFile,
} from '../types';
import * as logger from '../util/logger';

export class SessionNotFoundError extends Error {
  constructor(guildId: string) {
    super(`No active session found for guild ${guildId}.`);
    this.name = 'SessionNotFoundError';
  }
}

interface SessionManagerEvents {
  session_update: [guildId: string, snapshot: SessionSnapshot];
  sound_played: [guildId: string, playback: SessionPlaybackEvent];
}

const MAX_RECENT_PLAYS = 10;

export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private readonly sessions = new Map<string, Session>();

  private readonly scheduledPlaybackInProgressGuildIds = new Set<string>();

  private lastKnownGuildId: string | null = null;

  constructor(
    private readonly audioPlayerService: AudioPlayerService,
    private readonly soundLibrary: SoundLibrary,
    private readonly soundConfigService: SoundConfigService,
    private readonly densityCurveService: DensityCurveService,
  ) {
    super();
    this.densityCurveService.subscribe((guildId) => {
      this.applyDensityCurveUpdate(guildId);
    });
  }

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

    const createdSession: Session = {
      guildId,
      channelId: channel.id,
      voiceConnection,
      audioPlayer,
      soundSchedulers: new Map<string, Scheduler>(),
      config: {
        ...config,
      },
      isPlaying: false,
      createdAt: Date.now(),
      recentPlays: [],
      nowPlaying: null,
    };
    this.sessions.set(guildId, createdSession);
    this.lastKnownGuildId = guildId;
    this.syncSessionSoundSchedulers(createdSession);
    logger.info(`Created session for guild ${guildId} in channel ${channel.id}.`);
    this.emitSessionUpdate(guildId);

    return createdSession;
  }

  public destroySession(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return;
    }

    for (const scheduler of session.soundSchedulers.values()) {
      scheduler.stop();
    }
    session.soundSchedulers.clear();
    session.audioPlayer.stop(true);
    this.audioPlayerService.leaveChannel(guildId);
    this.sessions.delete(guildId);
    this.scheduledPlaybackInProgressGuildIds.delete(guildId);

    logger.info(`Destroyed session for guild ${guildId}.`);
    this.emitSessionUpdate(guildId);
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

  public getPrimaryGuildId(): string | null {
    const activeGuildId = this.sessions.keys().next().value;
    if (typeof activeGuildId === 'string') {
      return activeGuildId;
    }

    return this.lastKnownGuildId;
  }

  public getSessionSnapshot(guildId: string | null): SessionSnapshot {
    if (guildId === null) {
      return {
        active: false,
        guildId: null,
        channelId: null,
        isPlaying: false,
        uptime: null,
        nextSoundEta: null,
        recentPlays: [],
        nowPlaying: null,
      };
    }

    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return {
        active: false,
        guildId,
        channelId: null,
        isPlaying: false,
        uptime: null,
        nextSoundEta: null,
        recentPlays: [],
        nowPlaying: null,
      };
    }

    return {
      active: true,
      guildId,
      channelId: session.channelId,
      isPlaying: session.isPlaying,
      uptime: Math.max(0, Math.floor((Date.now() - session.createdAt) / 1000)),
      nextSoundEta: this.getEarliestNextPlayTime(guildId),
      recentPlays: session.recentPlays.map((play) => ({ ...play })),
      nowPlaying:
        session.nowPlaying === null ? null : { ...session.nowPlaying },
    };
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
      this.emitSessionUpdate(guildId);
    }
  }

  public startPlayback(guildId: string): boolean {
    const session = this.getRequiredSession(guildId);
    this.syncSessionSoundSchedulers(session);

    if (session.soundSchedulers.size === 0) {
      session.isPlaying = false;
      logger.warn(
        `No sounds available to schedule in guild ${guildId}. Playback remains stopped until sounds are added.`,
      );
      this.emitSessionUpdate(guildId);
      return false;
    }

    for (const scheduler of session.soundSchedulers.values()) {
      scheduler.start();
    }

    session.isPlaying = true;
    logger.info(
      `Started scheduled playback for guild ${guildId} with ${session.soundSchedulers.size} independent timer(s).`,
    );
    this.emitSessionUpdate(guildId);
    return true;
  }

  public stopPlayback(guildId: string): void {
    const session = this.getRequiredSession(guildId);
    for (const scheduler of session.soundSchedulers.values()) {
      scheduler.stop();
    }
    session.isPlaying = false;
    this.scheduledPlaybackInProgressGuildIds.delete(guildId);
    logger.info(`Stopped scheduled playback for guild ${guildId}.`);
    this.emitSessionUpdate(guildId);
  }

  public updateSessionConfig(guildId: string, config: GuildConfig): void {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return;
    }

    session.config = { ...config };
    this.syncSessionSoundSchedulers(session);
    logger.info(`Updated active session config for guild ${guildId}.`);
    this.emitSessionUpdate(guildId);
  }

  public async playSoundNow(
    guildId: string,
    soundPath: string,
    volumeMultiplier = 1,
  ): Promise<void> {
    const session = this.getRequiredSession(guildId);
    const sound = this.soundLibrary.getSounds().find((candidate) => {
      return candidate.path === soundPath;
    });

    if (sound !== undefined) {
      this.recordSoundPlayback(session, sound);
    }

    await this.audioPlayerService.playSound(
      guildId,
      soundPath,
      session.config.volume,
      volumeMultiplier,
    );

    if (sound !== undefined) {
      this.clearNowPlaying(guildId, sound.name);
    }

    logger.info(`Played manual sound in guild ${guildId}: ${soundPath}.`);
  }

  public syncAllSessionSoundSchedulers(): void {
    for (const session of this.sessions.values()) {
      this.syncSessionSoundSchedulers(session);
    }
  }

  public getEarliestNextPlayTime(guildId: string): number | null {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return null;
    }

    return SessionManager.findEarliestNextPlayTime(
      session.soundSchedulers.values(),
    );
  }

  public getSoundTimerCount(guildId: string): number {
    return this.sessions.get(guildId)?.soundSchedulers.size ?? 0;
  }

  public applySoundConfig(guildId: string, soundName: string): void {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return;
    }

    this.syncSessionSoundSchedulers(session);
    logger.info(
      `Applied sound config update for "${soundName}" in guild ${guildId}.`,
    );
    this.emitSessionUpdate(guildId);
  }

  private createGuildAudioPlayer(guildId: string): AudioPlayer {
    const player = createAudioPlayer();
    this.audioPlayerService.registerGuildAudioPlayer(guildId, player);
    return player;
  }

  private createSoundScheduler(session: Session, sound: SoundFile): Scheduler {
    const intervals = this.getEffectiveIntervals(
      session.config,
      this.soundConfigService.getSoundConfig(session.guildId, sound.name),
    );
    const sampleFn = this.getSchedulerSampleFn(session.guildId);

    return new Scheduler(
      intervals.minInterval,
      intervals.maxInterval,
      async () => {
        await this.playScheduledSound(session, sound);
      },
      sampleFn,
    );
  }

  private async playScheduledSound(
    session: Session,
    sound: SoundFile,
  ): Promise<void> {
    const activeSession = this.sessions.get(session.guildId);
    if (activeSession === undefined || !activeSession.isPlaying) {
      return;
    }

    if (!activeSession.soundSchedulers.has(sound.path)) {
      return;
    }

    const soundConfig = this.soundConfigService.getSoundConfig(
      activeSession.guildId,
      sound.name,
    );
    if (!soundConfig.enabled) {
      return;
    }

    if (
      this.scheduledPlaybackInProgressGuildIds.has(activeSession.guildId)
    ) {
      logger.debug(
        `Skipping scheduled sound "${sound.name}" in guild ${activeSession.guildId} because playback is already active.`,
      );
      return;
    }

    this.scheduledPlaybackInProgressGuildIds.add(activeSession.guildId);

    try {
      this.recordSoundPlayback(activeSession, sound);
      logger.info(
        `Guild ${activeSession.guildId} playing scheduled sound "${sound.name}" from ${sound.path}.`,
      );
      await this.audioPlayerService.playSound(
        activeSession.guildId,
        sound.path,
        activeSession.config.volume,
        soundConfig.volume,
      );
    } catch (error: unknown) {
      this.clearNowPlaying(activeSession.guildId, sound.name);
      if (error instanceof AudioPlaybackError) {
        logger.warn(
          `Skipping unplayable sound "${sound.name}" in guild ${activeSession.guildId}. Scheduler will continue.`,
        );
        logger.debug(`Audio playback error details: ${String(error)}`);
        return;
      }

      throw error;
    } finally {
      this.clearNowPlaying(activeSession.guildId, sound.name);
      this.scheduledPlaybackInProgressGuildIds.delete(activeSession.guildId);
    }
  }

  private syncSessionSoundSchedulers(session: Session): void {
    const sounds = this.soundLibrary.getSounds();
    const soundsByPath = new Map<string, SoundFile>();
    for (const sound of sounds) {
      soundsByPath.set(sound.path, sound);
    }

    for (const [soundPath, scheduler] of session.soundSchedulers.entries()) {
      if (soundsByPath.has(soundPath)) {
        continue;
      }

      scheduler.stop();
      session.soundSchedulers.delete(soundPath);
      logger.info(
        `Removed timer for deleted sound ${soundPath} in guild ${session.guildId}.`,
      );
    }

    for (const sound of sounds) {
      const soundConfig = this.soundConfigService.getSoundConfig(
        session.guildId,
        sound.name,
      );
      const existingScheduler = session.soundSchedulers.get(sound.path);

      if (!soundConfig.enabled) {
        if (existingScheduler === undefined) {
          continue;
        }

        existingScheduler.stop();
        session.soundSchedulers.delete(sound.path);
        logger.info(
          `Disabled timer for sound "${sound.name}" in guild ${session.guildId}.`,
        );
        continue;
      }

      const intervals = this.getEffectiveIntervals(session.config, soundConfig);
      const sampleFn = this.getSchedulerSampleFn(session.guildId);
      if (existingScheduler !== undefined) {
        existingScheduler.updateConfig(
          intervals.minInterval,
          intervals.maxInterval,
          sampleFn,
        );

        if (session.isPlaying && !existingScheduler.isRunning()) {
          existingScheduler.start();
        }
        continue;
      }

      const scheduler = this.createSoundScheduler(session, sound);
      session.soundSchedulers.set(sound.path, scheduler);
      logger.info(
        `Registered independent timer for sound "${sound.name}" in guild ${session.guildId}.`,
      );

      if (session.isPlaying) {
        scheduler.start();
      }
    }

    if (session.isPlaying && session.soundSchedulers.size === 0) {
      session.isPlaying = false;
      this.scheduledPlaybackInProgressGuildIds.delete(session.guildId);
      logger.warn(
        `No sounds remain in guild ${session.guildId}. Stopped playback until sounds are added.`,
      );
    }

    this.emitSessionUpdate(session.guildId);
  }

  private getEffectiveIntervals(
    guildConfig: GuildConfig,
    soundConfig: SoundConfig,
  ): { minInterval: number; maxInterval: number } {
    const baseMinInterval = soundConfig.minInterval ?? guildConfig.minInterval;
    const baseMaxInterval = soundConfig.maxInterval ?? guildConfig.maxInterval;

    return {
      minInterval: baseMinInterval / soundConfig.weight,
      maxInterval: baseMaxInterval / soundConfig.weight,
    };
  }

  private getSchedulerSampleFn(guildId: string): (() => number) | null {
    if (this.densityCurveService.isUniformPreset(guildId)) {
      return null;
    }

    return () => this.densityCurveService.sample(guildId);
  }

  private applyDensityCurveUpdate(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return;
    }

    this.syncSessionSoundSchedulers(session);
    logger.info(`Applied density curve update for guild ${guildId}.`);
    this.emitSessionUpdate(guildId);
  }

  private static findEarliestNextPlayTime(
    schedulers: Iterable<Scheduler>,
  ): number | null {
    let earliest: number | null = null;

    for (const scheduler of schedulers) {
      const nextPlayTime = scheduler.getNextPlayTime();
      if (nextPlayTime === null) {
        continue;
      }

      if (earliest === null || nextPlayTime < earliest) {
        earliest = nextPlayTime;
      }
    }

    return earliest;
  }

  private getRequiredSession(guildId: string): Session {
    const session = this.sessions.get(guildId);
    if (session !== undefined) {
      return session;
    }

    throw new SessionNotFoundError(guildId);
  }

  private recordSoundPlayback(session: Session, sound: SoundFile): void {
    const playbackEvent: SessionPlaybackEvent = {
      name: sound.name,
      category: sound.category,
      timestamp: new Date().toISOString(),
    };

    session.nowPlaying = playbackEvent;
    session.recentPlays = [
      playbackEvent,
      ...session.recentPlays,
    ].slice(0, MAX_RECENT_PLAYS);
    this.emit('sound_played', session.guildId, { ...playbackEvent });
    this.emitSessionUpdate(session.guildId);
  }

  private clearNowPlaying(guildId: string, soundName: string): void {
    const session = this.sessions.get(guildId);
    if (session === undefined) {
      return;
    }

    if (session.nowPlaying?.name !== soundName) {
      return;
    }

    session.nowPlaying = null;
    this.emitSessionUpdate(guildId);
  }

  private emitSessionUpdate(guildId: string): void {
    this.emit('session_update', guildId, this.getSessionSnapshot(guildId));
  }
}
