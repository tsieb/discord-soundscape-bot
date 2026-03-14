import { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { Scheduler } from '../services/scheduler';

export interface SoundFile {
  readonly name: string;
  readonly path: string;
  readonly category: string;
}

export interface GuildConfig {
  minInterval: number;
  maxInterval: number;
  volume: number;
}

export interface CurvePoint {
  t: number;
  d: number;
}

export type DensityCurve = CurvePoint[];

export interface SoundConfig {
  volume: number;
  weight: number;
  enabled: boolean;
  minInterval?: number;
  maxInterval?: number;
}

export interface SessionPlaybackEvent {
  name: string;
  category: string;
  timestamp: string;
}

export interface SessionSnapshot {
  active: boolean;
  guildId: string | null;
  channelId: string | null;
  isPlaying: boolean;
  uptime: number | null;
  nextSoundEta: number | null;
  recentPlays: SessionPlaybackEvent[];
  nowPlaying: SessionPlaybackEvent | null;
}

export interface Session {
  guildId: string;
  channelId: string;
  voiceConnection: VoiceConnection;
  audioPlayer: AudioPlayer;
  soundSchedulers: Map<string, Scheduler>;
  config: GuildConfig;
  isPlaying: boolean;
  createdAt: number;
  recentPlays: SessionPlaybackEvent[];
  nowPlaying: SessionPlaybackEvent | null;
}

export interface Command {
  readonly data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
