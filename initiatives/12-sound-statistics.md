# Initiative 12: Sound Statistics & Activity Insights

## Objective

Track how the bot is actually being used. Record every sound play — what was
played, when, and how it was triggered — and surface that data through a rich
set of statistics commands. Over time this creates a feedback loop: users can
discover under-used sounds, identify their guild's favourites, and tune their
library based on real usage data rather than guesswork. All data is stored in
local JSON files with no external database.

---

## Epic 12.1: Play Event Recording

Instrument the audio pipeline to capture a lightweight play record every time
a sound is heard.

### Stories

1. **Define the `PlayEvent` type**
   - Add to `src/types/index.ts`:
     ```ts
     type PlayTriggerSource =
       | 'scheduler'   // Random interval scheduler
       | 'manual'      // /sounds play command
       | 'trigger'     // Event trigger (voice join, keyword, etc.)
       | 'soundboard'; // Soundboard button click

     interface PlayEvent {
       readonly soundName: string;
       readonly category: string;
       readonly guildId: string;
       readonly triggeredBy: PlayTriggerSource;
       readonly timestamp: number; // Unix milliseconds
     }
     ```

2. **`StatsService`** (`src/services/stats-service.ts`)
   - Persists events to `data/stats/<guildId>.jsonl` (newline-delimited JSON,
     one event per line).
   - Using JSONL avoids loading the full history into memory on startup; events
     are appended only.
   - Methods:
     - `record(event: PlayEvent)` — append to the guild's JSONL file.
     - `query(guildId, options: StatsQueryOptions)` — stream-parse the file and
       return aggregated results.
     - `purgeOlderThan(guildId, cutoffMs)` — rewrite the file keeping only
       events newer than the cutoff.
     - `getTotalEventCount(guildId)` — fast line-count without full parse.
   - File is created on first write. If missing, `query` returns empty results.
   - Rotate / purge events older than 90 days automatically at bot startup.

3. **`StatsQueryOptions` type**
   - ```ts
     interface StatsQueryOptions {
       since?: number;       // Unix ms lower bound (default: 30 days ago)
       until?: number;       // Unix ms upper bound (default: now)
       soundName?: string;   // Filter to specific sound
       source?: PlayTriggerSource; // Filter to specific trigger source
       limit?: number;       // Max events to return (default 1000)
     }
     ```

4. **Instrument all play call sites**
   - `SessionManager.playSoundNow()` accepts an optional `source: PlayTriggerSource`
     parameter (default `'manual'`).
   - The Scheduler calls `playSoundNow` with `'scheduler'`.
   - The trigger engine calls it with `'trigger'`.
   - The soundboard handler calls it with `'soundboard'`.
   - After a successful play, `StatsService.record()` is called with the event
     data. Failures to record are logged at `WARN` level but do not interrupt
     playback.

---

## Epic 12.2: Aggregation & Query Engine

Build the in-memory aggregation logic that powers all stat views.

### Stories

1. **Core aggregations**
   - `buildTopSounds(events, n)` — return the `n` most-played sounds with play
     counts, sorted descending.
   - `buildLeastPlayed(events, n)` — sounds with the fewest plays (good for
     discovering forgotten library members).
   - `buildPlaysByDay(events)` — map of `YYYY-MM-DD → count` over the query
     window.
   - `buildPlaysBySource(events)` — breakdown by `PlayTriggerSource`.
   - `buildPlaysByCategory(events)` — count grouped by sound category.
   - `buildSoundTimeline(events, soundName)` — per-day play counts for one
     sound.
   - All functions are pure and take an `events: PlayEvent[]` array → easily
     unit-tested with no I/O.

2. **Computed totals**
   - Total events in window.
   - Unique sounds played.
   - Average plays per day.
   - Most active day.
   - Most popular trigger source (scheduler vs manual vs soundboard).

---

## Epic 12.3: `/sounds stats` Subcommand

Add a `stats` subcommand to the existing `/sounds` command.

### Stories

1. **`/sounds stats [window]`**
   - `window`: `7d` (default), `30d`, `90d`, or `all`.
   - Display a multi-section embed:
     - **Header**: "Sound Statistics — last 30 days — 247 plays"
     - **Top 5 sounds**: name, play count, sparkline bar (built from Unicode
       block characters), percentage of total.
     - **By source**: scheduler / manual / trigger / soundboard counts and
       percentage.
     - **By category**: top 3 categories with counts.
     - **Activity**: most active day, average plays per day.
   - Use Discord's `\`\`\`` code block formatting for the bar charts to keep
     alignment clean in any font.

2. **`/sounds stats sound <name>`**
   - Show stats for a single sound:
     - Total plays (all time vs. selected window).
     - First played / last played timestamps (Discord relative format).
     - Per-day sparkline over the window.
     - Play source breakdown.
     - Rank within the library (e.g., "#3 most played of 28 sounds").

3. **`/sounds stats leaderboard`**
   - Show the top 10 sounds as a numbered leaderboard embed.
   - Include a "bottom 5" section (least played, with suggestion to `/sounds remove`
     them if they've been in the library > 7 days with zero plays).

4. **`/sounds stats reset`**
   - Delete all stats data for the guild.
   - Require confirmation via a button interaction.
   - Requires `MANAGE_SOUNDS` permission (from Initiative 10).

---

## Epic 12.4: Activity Feed & Recent Plays

Surface a live-ish view of recent sound activity.

### Stories

1. **`/sounds recent [n]`**
   - Show the last `n` play events (default 10, max 25) in a simple list embed.
   - Each row: sound name, source icon, relative timestamp.
   - Gives a feel for how active the session has been.

2. **Optional: stats log channel**
   - Reuse the `logChannelId` from Initiative 7 (Smart Scheduling).
   - If a log channel is configured, post a lightweight embed each time a sound
     plays: sound name, source, timestamp. This creates a live activity stream
     visible in Discord without querying `/sounds stats`.
   - This is high-volume; gate it behind a `logPlayEvents: boolean` guild
     config flag (default `false`).

---

## Epic 12.5: Maintenance & Data Hygiene

Ensure stats data stays lean and doesn't grow unbounded.

### Stories

1. **Automatic purge on startup**
   - During bot startup (after `SoundLibrary` initialises), call
     `StatsService.purgeOlderThan(guildId, 90 days)` for every guild that has
     a stats file.
   - Log the number of events pruned at `INFO` level.

2. **Stats file size guard**
   - Before appending a new event, check if the guild's stats file exceeds
     10 MB (unlikely but defensive).
   - If over the limit, trigger an immediate purge of events older than 30 days
     before appending.
   - Log a `WARN` message so the operator knows the file is large.

3. **Stats excluded from `.gitignore` entry clarification**
   - `data/` is already git-ignored; ensure the README notes that `data/stats/`
     accumulates over time and can be backed up or deleted safely.

---

## Completion Criteria

- [ ] Every sound play records a `PlayEvent` to the guild's JSONL stats file.
- [ ] `/sounds stats` renders an accurate top-5 leaderboard, source breakdown,
      and activity summary for the selected time window.
- [ ] `/sounds stats sound <name>` shows per-sound history including sparkline
      and rank.
- [ ] `/sounds stats leaderboard` lists top 10 and bottom 5 with delete hints.
- [ ] `/sounds recent` shows the last 10 play events with source and timestamp.
- [ ] Stats files are automatically purged of events older than 90 days on bot
      startup.
- [ ] Recording a play event never interrupts or delays audio playback.
- [ ] All aggregation functions are unit-tested with fabricated event arrays.
- [ ] `StatsService.query` is tested with a real temp JSONL file.
- [ ] Stats are preserved across bot restarts (JSONL append-only model).
