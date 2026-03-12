# Discord Soundscape Bot

A Discord bot that plays random sounds at random intervals in voice channels.

## Quick Reference

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js 20+
- **Key deps:** discord.js v14, @discordjs/voice, sodium-native
- **External:** FFmpeg must be installed on the host

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start with tsx (hot reload)
npm run build        # Compile TypeScript
npm start            # Run compiled JS
npm run lint         # ESLint check
npm run format       # Prettier format
npm run deploy       # Register slash commands with Discord
```

## Project Structure

- `src/index.ts` - Entry point: loads env, creates client, wires services, logs in
- `src/client.ts` - Discord.js client config and event wiring
- `src/commands/` - One file per slash command, each exports `data` (SlashCommandBuilder) and `execute` function
- `src/services/` - Core business logic:
  - `session-manager.ts` - Per-guild session lifecycle (Map<guildId, Session>)
  - `scheduler.ts` - Random interval timer (setTimeout-based)
  - `sound-library.ts` - Scans sounds/ directory, provides random sound selection
  - `audio-player.ts` - @discordjs/voice AudioPlayer wrapper, plays files
  - `config-service.ts` - Reads/writes guild config to data/config.json
- `src/types/index.ts` - Shared interfaces (GuildConfig, Session, SoundFile, etc.)
- `src/util/logger.ts` - Console logger with level prefixes
- `sounds/` - Audio files (.mp3, .wav, .ogg, .flac), can contain subdirectories
- `data/` - Runtime data (config.json for guild settings), git-ignored
- `scripts/generate-sounds.ts` - Generates starter sounds using FFmpeg

## Key Patterns

- Services use constructor injection, not singletons. Composition root is `src/index.ts`.
- Per-guild state lives in a `Map<string, Session>` inside SessionManager.
- Sound scheduling: after a sound plays, `setTimeout` with a random delay
  (`min + Math.random() * (max - min)`) schedules the next one.
- Audio pipeline: file path → `createAudioResource()` (FFmpeg transcode) → `AudioPlayer.play()` → VoiceConnection.
- Slash commands only (no prefix commands, no message content intent needed).

## File Conventions

- Filenames: kebab-case (e.g., `sound-library.ts`)
- Exports: named exports only, no default exports
- One command per file in commands/
- Error subclasses for domain errors

## Environment

Bot token and client ID come from `.env` (see `.env.example`).
`GUILD_ID` is optional - set it during dev for instant command registration
(guild commands update immediately; global commands take up to an hour).
