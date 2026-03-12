# Initiative 5: Resilience, Starter Content & Documentation

## Objective

Harden the bot against real-world edge cases, provide a starter sound pack
so it works out of the box, and write documentation for setup and usage. By
the end of this initiative, the bot is a complete, self-contained MVP ready
for daily use.

---

## Epic 5.1: Error Handling & Resilience

Audit and strengthen error handling across the bot to ensure it does not
crash or silently break during normal usage.

### Stories

1. **Voice connection resilience**
   - Handle the scenario where Discord disconnects the bot (server region
     change, network blip). Attempt automatic reconnection with exponential
     backoff (max 3 attempts).
   - Handle the bot being moved to a different channel by a server admin
     (update session state).
   - Handle the bot being server-deafened or server-muted (continue
     scheduling but log a warning that sounds won't be heard).
   - Clean up sessions when the bot is kicked from the server.

2. **Audio playback error handling**
   - Handle corrupted or unplayable sound files gracefully: log a warning,
     skip the sound, schedule the next one.
   - Handle FFmpeg process crashes: catch the error, log it, attempt the
     next sound.
   - If the sound library becomes empty during playback (all sounds deleted),
     stop the scheduler and notify via a log message.

3. **Global error handlers and process lifecycle**
   - Wire up `process.on('unhandledRejection')` and
     `process.on('uncaughtException')` to log and optionally exit.
   - On SIGINT/SIGTERM: gracefully destroy all sessions (leave all VCs),
     then exit.
   - Ensure no resource leaks: timers cleared, connections destroyed,
     file handles closed.

4. **Permission checks**
   - Before joining a voice channel, verify the bot has `Connect` and
     `Speak` permissions in that channel.
   - If permissions are missing, reply with a clear message telling the
     user what permissions to grant.
   - Check permissions on the command channel too (bot needs `SendMessages`
     and `EmbedLinks` to respond).

---

## Epic 5.2: Starter Sound Pack

Generate a set of starter sounds so the bot works immediately without the
user needing to source their own audio files.

### Stories

1. **Create a sound generation script**
   - `scripts/generate-sounds.ts`: uses FFmpeg to generate simple sounds:
     - Sine wave tones at various frequencies and durations (e.g., a short
       beep, a long hum, a high chirp, a low drone).
     - White noise bursts of various lengths.
     - Simple chimes or bell-like tones (FM synthesis via FFmpeg filters).
   - Generate 15-25 distinct sounds, each 0.5-5 seconds long.
   - Output to `sounds/generated/` subdirectory.
   - Add an npm script: `npm run generate-sounds`.

2. **Organize the starter sounds**
   - Use subdirectories for basic categories: `generated/tones/`,
     `generated/noise/`, `generated/chimes/`.
   - Use descriptive filenames: `high-beep.mp3`, `low-drone.mp3`,
     `white-noise-burst.mp3`, etc.
   - Keep total size small (under 2 MB for all generated sounds).
   - Document in README how to add more sounds from sources like
     freesound.org, soundbible.com, etc.

---

## Epic 5.3: Documentation & Setup Guide

Write clear, complete documentation so a new user (or future-you) can set
up and run the bot from scratch.

### Stories

1. **Write the README**
   - Project description and feature list.
   - Prerequisites: Node.js 20+, FFmpeg, a Discord bot token.
   - Step-by-step setup guide:
     1. Clone the repo.
     2. `npm install`
     3. Create a Discord application and bot at discord.com/developers.
     4. Copy `.env.example` to `.env`, fill in token and client ID.
     5. `npm run generate-sounds` (optional starter pack).
     6. `npm run deploy` (register slash commands).
     7. `npm run dev` (start the bot).
   - Invite URL instructions (with required permissions/scopes).
   - Command reference table.
   - Adding custom sounds section.
   - Configuration reference.
   - Troubleshooting section (common issues: FFmpeg not found, missing
     permissions, no sounds in library).

2. **Create the `.env.example` file**
   - All environment variables with descriptions and example values.
   - Clear comments explaining each variable.
   - Indicate which are required vs optional.

3. **Add inline help to the bot**
   - Implement a `/help` command that shows a summary of all available
     commands and what they do.
   - Include brief tips: how to add sounds, how to adjust timing, etc.
   - Use an embed for clean formatting.

---

## Completion Criteria

- [ ] Bot recovers from voice disconnections without manual intervention.
- [ ] Corrupted sound files are skipped, not fatal.
- [ ] Ctrl+C produces a clean shutdown with all VCs left.
- [ ] Permission errors produce clear, actionable messages to the user.
- [ ] `npm run generate-sounds` creates 15+ playable sound files.
- [ ] README covers full setup from zero to running bot.
- [ ] `.env.example` documents all environment variables.
- [ ] `/help` command provides a useful command reference.
- [ ] A new user can go from clone to running bot in under 10 minutes.
