# Initiative 7: Smart Scheduling & Auto-Join

## Objective

Let the bot run itself. Users define recurring schedules — the bot joins a
voice channel at a set time, plays the soundscape, and leaves when the window
closes, all without human intervention. Time-zone support ensures schedules
feel local, and automatic idle detection keeps the bot from squatting in an
empty channel. By the end of this initiative, the bot can be set up once and
run as a persistent ambient presence throughout a server's daily routine.

---

## Epic 7.1: Schedule Data Model & Storage

Define what a schedule entry looks like and how it persists alongside guild
config.

### Stories

1. **Define the `ScheduleEntry` type**
   - Add to `src/types/index.ts`:
     ```ts
     interface ScheduleEntry {
       readonly id: string;           // UUID, generated on creation
       readonly guildId: string;
       readonly channelId: string;    // Voice channel to join
       readonly days: DayOfWeek[];    // e.g. ['monday', 'tuesday', 'friday']
       readonly startHour: number;    // Local hour 0–23
       readonly startMinute: number;  // 0–59
       readonly durationMinutes: number; // How long to stay (0 = indefinite)
       readonly sceneName: string | null; // Optional scene to activate
       readonly timezone: string;     // IANA tz string, e.g. 'America/New_York'
       readonly enabled: boolean;
     }

     type DayOfWeek =
       | 'monday' | 'tuesday' | 'wednesday' | 'thursday'
       | 'friday' | 'saturday' | 'sunday';
     ```

2. **`ScheduleService`** (`src/services/schedule-service.ts`)
   - Responsible for persisting entries to `data/schedules.json` (one file,
     all guilds, keyed by guild ID).
   - Methods:
     - `addSchedule(entry)` — validate, assign UUID, persist.
     - `removeSchedule(guildId, id)` — delete by ID.
     - `getSchedules(guildId)` — return all entries for a guild.
     - `toggleSchedule(guildId, id, enabled)` — enable/disable without
       deletion.
   - Cap: maximum 5 schedules per guild.
   - Inject as a dependency alongside `ConfigService`.

3. **`ScheduleRunner`** (`src/services/schedule-runner.ts`)
   - A singleton that holds one Node.js `setInterval` polling at 10-second
     granularity.
   - On each tick:
     1. Load all enabled schedule entries from `ScheduleService`.
     2. For each entry, compute the next expected fire time using the IANA
        timezone (via the `Temporal` API or the `luxon` library).
     3. If the current time is within 10 seconds of a scheduled start and the
        bot is not already in the target channel, trigger the auto-join
        sequence.
     4. If a scheduled session has exceeded `durationMinutes`, trigger
        auto-leave.
   - `ScheduleRunner` fires events into `SessionManager`; it does not interact
     with Discord.js directly.
   - The runner starts at bot startup and is stopped on graceful shutdown.
   - Add `luxon` to production dependencies for timezone-safe date arithmetic.

---

## Epic 7.2: Auto-Join & Auto-Leave Sequences

Implement the actual joining and leaving logic triggered by the runner.

### Stories

1. **Auto-join sequence**
   - `ScheduleRunner` calls `SessionManager.autoJoin(guildId, channelId, sceneName)`.
   - `SessionManager.autoJoin`:
     1. Resolves the voice channel from the Discord client cache.
     2. Checks bot permissions (`Connect`, `Speak`); if missing, logs an error
        and skips (no way to notify a user at this point — see logging story).
     3. Creates a session (same path as `/join`).
     4. Activates the optional scene.
     5. Starts playback (same path as `/start`).
   - Auto-join is silently skipped if the bot is already in a session in the
     same guild (manual sessions take priority).

2. **Auto-leave sequence**
   - `ScheduleRunner` calls `SessionManager.autoLeave(guildId, reason)`.
   - Destroys the session gracefully (same as `/leave`).
   - Reason codes: `'schedule_end'`, `'empty_channel'`.

3. **Idle channel detection (auto-leave on empty)**
   - Watch `VoiceStateUpdate` events in the `AudioPlayerService`.
   - When the bot detects that it is the only remaining member in its voice
     channel (all humans have left), start a 60-second countdown.
   - After 60 seconds with no humans joining, call `autoLeave(guildId, 'empty_channel')`.
   - Cancel the countdown if a human rejoins within the window.
   - This behaviour is opt-in: controlled by a `leaveOnEmpty: boolean` guild
     config field (default `true`).

---

## Epic 7.3: `/schedule` Command

Expose schedule management through a slash command with five subcommands.

### Stories

1. **`/schedule list`**
   - Show all schedules for the guild in an embed table.
   - Columns: ID (short), days, start time (in guild's timezone), duration,
     scene, status (enabled/disabled).
   - If no schedules exist, show a helpful "Get started with `/schedule add`"
     message.

2. **`/schedule add <days> <time> <channel> [duration] [scene] [timezone]`**
   - `days`: comma-separated day names or shorthand (`mon,wed,fri`).
   - `time`: `HH:MM` 24-hour format.
   - `channel`: voice channel mention or name.
   - `duration`: minutes the session should last (0 = stay indefinitely until
     manually stopped or the channel empties).
   - `scene`: optional scene name to activate on join.
   - `timezone`: IANA string (default: guild's configured timezone, or `UTC`).
   - Validate all fields, then confirm with an embed showing the full schedule
     and the next computed fire time.

3. **`/schedule remove <id>`**
   - Delete a schedule by its short ID (the first 8 chars of the UUID, shown
     in `/schedule list`).
   - Confirm deletion.

4. **`/schedule toggle <id>`**
   - Enable or disable a schedule without deleting it.

5. **`/schedule timezone <iana_timezone>`**
   - Set the guild's default timezone so all future `/schedule add` calls
     without an explicit timezone use the right local time.
   - Validate the IANA string (reject unknown values).
   - Persist in `GuildConfig.timezone`.
   - Show the current local time in that timezone as confirmation.

---

## Epic 7.4: Operational Logging & Auditability

Since auto-join/leave happens without a user command, the bot must leave a
clear record of what it did and why.

### Stories

1. **Auto-event log channel**
   - Add `logChannelId: string | null` to `GuildConfig` (default `null`).
   - Add `/config set log_channel <channel>` option to the existing config
     command.
   - When set, the `ScheduleRunner` posts a simple embed to that channel on
     every auto-join and auto-leave event, including: schedule ID, channel
     name, reason, and timestamp.

2. **Verbose server-side logging**
   - `ScheduleRunner` logs each tick evaluation at `DEBUG` level: which
     schedules were checked, next fire times, and any that fired.
   - Auto-join failures (permission missing, channel gone) log at `WARN` level
     with the schedule ID and guild ID.

3. **`/status` schedule context**
   - If the current session was started by a schedule (not manually), the
     `/status` embed notes: _"Started by schedule `abc12345` — ends in 43
     minutes"_ (or _"runs indefinitely"_ if duration is 0).

---

## Completion Criteria

- [ ] `ScheduleService` persists entries to `data/schedules.json` across
      restarts.
- [ ] `ScheduleRunner` wakes up every 10 seconds and evaluates all enabled
      schedules.
- [ ] A schedule set for Monday 09:00 America/New_York fires correctly
      regardless of the server's local timezone.
- [ ] Bot auto-leaves when the channel is empty for 60+ seconds (when
      `leaveOnEmpty` is enabled).
- [ ] `/schedule add` validates all inputs and shows the next computed fire
      time.
- [ ] A configured log channel receives embeds on every auto-join and
      auto-leave.
- [ ] Schedules survive bot restarts without data loss.
- [ ] All new services have unit tests; `ScheduleRunner` uses fake timers.
- [ ] Maximum 5 schedules per guild is enforced with a clear error message.
