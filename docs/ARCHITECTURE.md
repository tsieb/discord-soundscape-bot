# Architecture

## Tech Stack

| Layer            | Choice                          | Rationale                                                        |
|------------------|---------------------------------|------------------------------------------------------------------|
| Runtime          | Node.js 20+ (LTS)              | Mature, excellent Discord library support, async-native.         |
| Language         | TypeScript 5.x (strict mode)   | Type safety, better DX, catches bugs at compile time.            |
| Discord library  | discord.js v14                  | Industry standard, best voice support, active maintenance.       |
| Voice            | @discordjs/voice 0.18+         | Official voice library for discord.js, handles opus/encryption.  |
| Audio processing | FFmpeg (external binary)        | Universal codec support, transcodes any format to opus.          |
| Encryption       | sodium-native                   | Required by @discordjs/voice for voice encryption.               |
| Dev runner       | tsx                             | Fast TypeScript execution for development, zero config.          |
| Build            | tsc                             | Standard TypeScript compiler for production builds.              |
| Linting          | ESLint 9 (flat config)          | Modern config format, @typescript-eslint for TS rules.           |
| Formatting       | Prettier                        | Consistent code style, no debates.                               |
| Env config       | dotenv                          | Load .env file for bot token and settings.                       |
| Persistence      | JSON files                      | No database needed - guild config stored as plain JSON.          |
| Package manager  | npm                             | Ships with Node.js, no extra install step.                       |

### Why Not...

- **Python / discord.py** - Voice dependencies (PyNaCl, opus) are finicky on
  Windows. TypeScript offers better type safety for a structured project.
- **Rust / serenity** - Excellent footprint but voice support (songbird) has a
  steeper learning curve. Overkill for a personal bot.
- **Bun** - Faster runtime but native module compatibility (@discordjs/voice
  depends on sodium-native and opus bindings) is not yet reliable.

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                 Discord Gateway                  │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│              Bot Client (discord.js)             │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  Command Router   │  │   Event Handler      │ │
│  │  (slash commands) │  │  (ready, voiceState)  │ │
│  └────────┬─────────┘  └──────────┬───────────┘ │
│           │                       │              │
│  ┌────────▼───────────────────────▼───────────┐ │
│  │           Session Manager                   │ │
│  │   (per-guild state: connection + scheduler) │ │
│  └──┬──────────────┬────────────────────┬─────┘ │
│     │              │                    │        │
│  ┌──▼───────┐  ┌───▼──────────┐  ┌─────▼─────┐ │
│  │ Voice    │  │  Scheduler   │  │  Config   │ │
│  │ Manager  │  │  (random     │  │  Service  │ │
│  │ (join,   │  │   interval   │  │  (guild   │ │
│  │  leave,  │  │   timer)     │  │   prefs)  │ │
│  │  play)   │  │              │  │           │ │
│  └──┬───────┘  └──────────────┘  └───────────┘ │
│     │                                           │
│  ┌──▼──────────────────────────────────────┐    │
│  │         Audio Player                     │   │
│  │  (@discordjs/voice AudioPlayer           │   │
│  │   + createAudioResource from file)       │   │
│  └──┬──────────────────────────────────────┘    │
│     │                                           │
│  ┌──▼──────────────────────────────────────┐    │
│  │         Sound Library                    │   │
│  │  (scans sounds/ directory, random pick)  │   │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│                 File System                      │
│                                                  │
│  sounds/              Sound files (.mp3/.wav/.ogg)│
│  data/config.json     Guild configuration         │
│  .env                 Bot token + defaults        │
└─────────────────────────────────────────────────┘
```

## Directory Structure

```
discord-soundscape-bot/
├── src/
│   ├── index.ts                 # Entry point: load env, create client, login
│   ├── client.ts                # Discord.js client setup, event wiring
│   ├── commands/
│   │   ├── index.ts             # Command registry and deploy logic
│   │   ├── join.ts              # /join command
│   │   ├── leave.ts            # /leave command
│   │   ├── start.ts             # /start command
│   │   ├── stop.ts              # /stop command
│   │   ├── status.ts            # /status command
│   │   ├── config.ts            # /config command
│   │   └── sounds.ts            # /sounds subcommands (list, add, remove)
│   ├── services/
│   │   ├── session-manager.ts   # Per-guild session lifecycle
│   │   ├── scheduler.ts         # Random interval timer
│   │   ├── sound-library.ts     # File-based sound collection
│   │   ├── audio-player.ts      # Voice connection + audio resource playback
│   │   └── config-service.ts    # Guild config load/save (JSON)
│   ├── types/
│   │   └── index.ts             # Shared TypeScript interfaces
│   └── util/
│       └── logger.ts            # Simple console logger with prefixes
├── sounds/                      # Sound files (user-managed)
│   └── .gitkeep
├── data/                        # Runtime data (git-ignored)
│   └── .gitkeep
├── scripts/
│   └── generate-sounds.ts       # Generate starter sound pack via FFmpeg
├── docs/                        # Project documentation
├── initiatives/                 # Project planning documents
├── .env.example                 # Template for required env vars
├── .gitignore
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── CLAUDE.md
└── README.md
```

## Key Design Decisions

### 1. File-Based Sound Library (No Database)

Sounds are plain audio files in `sounds/`. The `SoundLibrary` service scans
this directory at startup and watches for changes. This means:
- Adding sounds = drop a file in the folder (or use `/sounds add`).
- No migration scripts, no schema, no ORM.
- Trade-off: no metadata beyond filename. Category can be inferred from
  subdirectory structure (e.g., `sounds/funny/`, `sounds/scary/`).

### 2. Per-Guild Sessions (In-Memory)

Each guild where the bot is active gets a `Session` object holding:
- The voice connection
- The audio player
- The scheduler timer reference
- Current configuration snapshot

Sessions are stored in a `Map<string, Session>` in memory. They are ephemeral -
if the bot restarts, users just `/join` and `/start` again. Guild *config* is
persisted to `data/config.json` so preferences survive restarts.

### 3. Random Interval Strategy

After each sound plays, the next interval is calculated as:
```
delay = minInterval + Math.random() * (maxInterval - minInterval)
```
This gives a uniform distribution between min and max. A simple `setTimeout`
schedules the next play. No cron, no complex timer library needed.

### 4. Audio Pipeline

```
Sound file (.mp3/.wav/.ogg)
  → createAudioResource() (uses FFmpeg via prism-media)
  → AudioPlayer.play()
  → VoiceConnection subscription
  → Discord voice channel
```

`@discordjs/voice` handles opus encoding and encryption automatically.
`createAudioResource` accepts a file path and uses FFmpeg to transcode to
opus in real-time. The inline volume transform is enabled for volume control.

### 5. Slash Commands Over Prefix Commands

Discord is deprecating message content intent for unverified bots. Slash
commands are the modern standard - they provide auto-complete, validation,
and don't require the message content privileged intent.

## External Dependencies

| Dependency     | Type     | Notes                                           |
|----------------|----------|-------------------------------------------------|
| FFmpeg         | Binary   | Must be installed on the host. Required for any audio playback. |
| Discord Bot    | API      | Requires a bot application and token from Discord Developer Portal. |
| Node.js 20+   | Runtime  | LTS version for stability and native fetch.      |

## Resource Expectations

| Metric                | Expected Value       |
|-----------------------|----------------------|
| Idle memory           | ~40-60 MB            |
| Active (1 guild)      | ~60-80 MB            |
| CPU (idle)            | < 1%                 |
| CPU (playing sound)   | Brief spike ~5-10%   |
| Disk (excluding sounds)| < 5 MB              |
| Network               | Minimal (voice UDP)  |
