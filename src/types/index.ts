import { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import {
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

export interface Session {
  guildId: string;
  channelId: string;
  voiceConnection: VoiceConnection;
  audioPlayer: AudioPlayer;
  scheduler: Scheduler;
  config: GuildConfig;
  isPlaying: boolean;
}

export interface Command {
  readonly data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
