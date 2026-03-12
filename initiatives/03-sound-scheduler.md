# Initiative 3: Core Loop - Sound Scheduler & Session Management

## Objective

Build the heart of the bot: the random interval scheduler that picks sounds
and triggers playback, the session manager that coordinates per-guild state,
and the configuration service that persists user preferences. By the end of
this initiative, calling `sessionManager.start(guildId)` begins the random
sound loop and `sessionManager.stop(guildId)` halts it.

---

## Epic 3.1: Random Interval Scheduler

Implement the timer engine that waits a random duration between a configured
min and max, then fires a callback. This is the core timing mechanism for the
bot.

### Stories

1. **Implement the scheduler class**
   - `src/services/scheduler.ts`: a `Scheduler` class that manages a single
     recurring random timer.
   - Constructor takes `minInterval` and `maxInterval` (in seconds) and an
     `onTick` callback.
   - `start()`: calculates a random delay between min and max, sets a
     `setTimeout`, and when it fires, calls `onTick()` then schedules the
     next tick (recursive scheduling).
   - `stop()`: clears the current timeout, resets state.
   - `isRunning()`: returns whether the scheduler is active.
   - `updateConfig(min: number, max: number)`: updates timing parameters.
     Takes effect on the next scheduled tick (does not restart the current
     timer).
   - `getNextPlayTime()`: returns the timestamp when the next sound will
     play (for the status command). Returns `null` if not running.

2. **Handle edge cases in scheduling**
   - If `onTick` throws or rejects, log the error and continue scheduling
     (the loop must not die due to a single playback failure).
   - If `stop()` is called while `onTick` is executing (e.g., a sound is
     currently playing), let the current sound finish but don't schedule
     the next one.
   - Validate that `minInterval > 0` and `maxInterval >= minInterval`.

---

## Epic 3.2: Session Manager

Coordinate per-guild state: each guild with an active soundscape gets a
session object that ties together the voice connection, audio player,
scheduler, and configuration.

### Stories

1. **Define the session data model and manager**
   - `src/types/index.ts`: define a `Session` interface containing:
     - `guildId: string`
     - `channelId: string`
     - `voiceConnection` reference
     - `audioPlayer` reference
     - `scheduler` instance
     - `config: GuildConfig` (current interval/volume settings)
     - `isPlaying: boolean` (whether the scheduler loop is active)
   - `src/services/session-manager.ts`: manages a `Map<string, Session>`.

2. **Implement session lifecycle methods**
   - `createSession(guildId, channel, config)`: creates a new session,
     joins the voice channel, initializes the audio player and scheduler.
     Wires the scheduler's `onTick` to pick a random sound and play it.
   - `destroySession(guildId)`: stops the scheduler, stops the audio
     player, leaves the voice channel, removes from the map.
   - `getSession(guildId)`: returns the session or undefined.
   - `hasSession(guildId)`: boolean check.
   - `startPlayback(guildId)`: starts the scheduler on an existing session.
   - `stopPlayback(guildId)`: stops the scheduler without destroying the
     session (bot stays in VC, just stops playing sounds).

3. **Wire the onTick handler (scheduler → sound library → audio player)**
   - The `onTick` callback in each session should:
     1. Get a random sound from the sound library.
     2. Play it through the session's audio player at the configured volume.
     3. Log which sound is being played.
   - This is where the three systems (scheduler, sound library, audio
     player) converge. Keep the wiring clean and straightforward.

---

## Epic 3.3: Configuration Service

Persist guild-specific configuration (interval timing, volume) to a JSON file
so preferences survive bot restarts.

### Stories

1. **Implement the configuration service**
   - `src/services/config-service.ts`: manages guild configuration.
   - `getConfig(guildId: string): GuildConfig`: returns the config for a
     guild, falling back to defaults from env vars.
   - `setConfig(guildId: string, partial: Partial<GuildConfig>)`: merges
     partial updates into the guild's config and persists.
   - `GuildConfig` interface: `{ minInterval: number, maxInterval: number,
     volume: number }`.

2. **Persist to a JSON file**
   - Store all guild configs in `data/config.json` as
     `{ [guildId]: GuildConfig }`.
   - Read on startup, write on every change (file is small, this is fine).
   - Handle missing or corrupted file gracefully (reset to empty object).
   - Ensure the `data/` directory exists before writing.

---

## Completion Criteria

- [ ] `Scheduler` starts and fires callbacks at random intervals within the
      configured range.
- [ ] `Scheduler` can be stopped and restarted cleanly.
- [ ] `SessionManager.createSession()` joins a channel and begins playing
      random sounds.
- [ ] `SessionManager.stopPlayback()` stops sounds but keeps the bot in VC.
- [ ] `SessionManager.destroySession()` fully cleans up (leaves VC, stops
      timers).
- [ ] Multiple guild sessions can run concurrently without interference.
- [ ] Guild config is persisted to `data/config.json` and loaded on restart.
- [ ] A single playback failure does not crash the scheduling loop.
