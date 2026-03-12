# Discord Soundscape Bot - Project Brief

## Vision

A lightweight Discord bot that joins voice channels and plays random sounds at
unpredictable intervals, recreating the experience of those YouTube videos where
unexpected sounds punctuate long stretches of silence. The result is an ambient,
surprising, sometimes hilarious soundscape for voice chat participants.

## Goals

- **Voice channel presence** - Bot joins a VC and plays random sound clips from
  a local library at random intervals within a configurable range.
- **User control** - Discord slash commands to start/stop, configure timing and
  volume, and manage the sound library.
- **Extensible sound library** - Ship with a generated starter pack of sounds;
  users can add their own by dropping files into a directory or uploading via
  Discord.
- **Low local footprint** - Runs on a single machine with minimal resource
  usage (~50-80 MB RAM). No database, no cloud dependencies beyond the Discord
  gateway.
- **Simple setup** - Clone, install, add a bot token, run. Minimal external
  dependencies (Node.js + FFmpeg).

## Non-Goals

- Music playback, queuing, or streaming from YouTube/Spotify/etc.
- Web dashboard or admin panel.
- Database backend (SQLite, Postgres, etc.).
- Multi-shard or large-scale deployment.
- Audio recording or voice activity detection.
- Scheduled playlists or time-of-day awareness (stretch goal at best).

## Core Features

| # | Feature                     | Description                                                     |
|---|-----------------------------|-----------------------------------------------------------------|
| 1 | Voice join/leave            | Bot joins the invoking user's VC and leaves on command or empty. |
| 2 | Random sound loop           | Plays a random sound, waits a random interval, repeats.         |
| 3 | Configurable timing         | Min and max seconds between sounds, adjustable per guild.       |
| 4 | Volume control              | Adjustable playback volume (inline volume transform).           |
| 5 | Sound library browse        | List available sounds, see count and categories.                |
| 6 | Sound upload                | Upload new sounds via Discord file attachment.                  |
| 7 | Sound removal               | Remove sounds by name.                                          |
| 8 | Session status              | Show what the bot is doing: channel, next sound ETA, config.    |
| 9 | Starter sound pack          | Generated set of basic sounds so the bot works out of the box.  |

## User Experience

1. User invites the bot to their Discord server.
2. User joins a voice channel.
3. `/join` - Bot enters the user's voice channel.
4. `/start` - Bot begins the random sound loop with default settings.
5. `/config min_interval:60 max_interval:300` - Adjust timing.
6. `/sounds list` - Browse available sounds.
7. `/sounds add` (with file attachment) - Upload a new sound.
8. `/stop` - Pause the loop. `/start` resumes.
9. `/leave` - Bot disconnects from voice.

## Success Criteria

- Bot connects to a voice channel and plays sounds without manual intervention.
- Random intervals feel genuinely unpredictable (uniform random distribution).
- Adding new sounds requires zero code changes.
- Full cold start to operational in under 5 seconds.
- Idle memory usage under 100 MB.
