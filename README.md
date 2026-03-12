# Discord Soundscape Bot

A lightweight Discord bot that joins voice channels and plays random sounds at
random intervals. It is designed for ambient, surprising background moments
during voice chat sessions.

## Features

- Voice channel join/leave controls
- Randomized sound playback loop
- Per-guild interval and volume configuration
- File-based sound library with upload/remove/list commands
- Starter sound generation script (`npm run generate-sounds`)
- Status and inline help commands

## Prerequisites

- Node.js 20+
- FFmpeg available in your system `PATH`
- A Discord application with a bot token

## Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a Discord application + bot at
   [discord.com/developers](https://discord.com/developers/applications).
4. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `CLIENT_ID`.
5. Generate starter sounds (optional, but recommended):
   ```bash
   npm run generate-sounds
   ```
6. Register slash commands:
   ```bash
   npm run deploy
   ```
7. Start the bot:
   ```bash
   npm run dev
   ```

## Invite URL

Use your Discord app client ID with this URL template:

```text
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=3197952
```

Required scopes:

- `bot`
- `applications.commands`

Required permissions:

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Connect
- Speak

## Command Reference

| Command | Description |
|---|---|
| `/help` | Show a quick command and usage guide. |
| `/join` | Join the invoking user's voice channel. |
| `/leave` | Leave voice and clear the guild session. |
| `/start` | Start random scheduled playback. |
| `/stop` | Stop scheduled playback without leaving voice. |
| `/status` | Show session state, config, and next sound ETA. |
| `/config view` | Show current guild config. |
| `/config set` | Update min interval, max interval, and/or volume. |
| `/config reset` | Reset guild config to defaults. |
| `/sounds list` | List sounds, optionally filtered by category. |
| `/sounds add` | Upload a supported audio file. |
| `/sounds remove` | Remove a sound by name. |
| `/sounds play` | Immediately play a specific sound. |

## Adding Custom Sounds

Supported formats: `.mp3`, `.wav`, `.ogg`, `.flac`, `.webm`.

You can add sounds in two ways:

- Upload via `/sounds add`
- Copy files directly into `sounds/` (you can use subfolders for categories)

Useful libraries for legal sound effects:

- [freesound.org](https://freesound.org/)
- [soundbible.com](http://soundbible.com/)
- [pixabay sound effects](https://pixabay.com/sound-effects/)

Always verify license terms before using third-party content.

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_TOKEN` | Yes | - | Bot token from Discord Developer Portal. |
| `CLIENT_ID` | Yes | - | Discord application client ID. |
| `GUILD_ID` | No | - | Dev guild ID for faster slash command deployment. |
| `DEFAULT_MIN_INTERVAL` | No | `30` | Default minimum seconds between sounds. |
| `DEFAULT_MAX_INTERVAL` | No | `300` | Default maximum seconds between sounds. |
| `DEFAULT_VOLUME` | No | `0.5` | Default playback volume from `0.0` to `1.0`. |
| `LOG_LEVEL` | No | `info` | Log verbosity (`info` or `debug`). |
| `SOUNDS_DIR` | No | `./sounds` | Path to sound library directory. |
| `DATA_DIR` | No | `./data` | Path to runtime data/config directory. |

## Troubleshooting

### FFmpeg not found

Symptom: startup or `npm run generate-sounds` fails with a missing FFmpeg error.

Fix:

- Install FFmpeg for your OS
- Confirm `ffmpeg -version` works in your terminal
- Restart the shell after updating `PATH`

### Missing Discord permissions

Symptom: bot cannot join voice, cannot speak, or cannot respond in text channels.

Fix:

- Re-invite the bot with required permissions
- Ensure channel-level overrides are not denying `Connect`, `Speak`,
  `Send Messages`, or `Embed Links`

### No sounds available

Symptom: `/start` runs but playback stops or status shows no usable sounds.

Fix:

- Run `npm run generate-sounds`
- Add your own files to `sounds/`
- Use `/sounds list` to verify the library is populated
