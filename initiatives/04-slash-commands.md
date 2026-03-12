# Initiative 4: Slash Commands & User Interaction

## Objective

Implement all user-facing slash commands that control the bot. These commands
are the interface layer between Discord users and the services built in
Initiatives 1-3. By the end of this initiative, users can fully control the
bot through Discord's slash command UI.

---

## Epic 4.1: Core Playback Commands

The essential commands to get the bot into a voice channel and start/stop the
soundscape.

### Stories

1. **Implement `/join`**
   - Joins the voice channel the invoking user is currently in.
   - If the user is not in a voice channel, reply with an error.
   - If the bot is already in a voice channel in this guild, move to the
     user's channel.
   - Creates a session via `SessionManager` (but does not start playback
     automatically - user must `/start`).
   - Reply with confirmation: "Joined **#channel-name**".

2. **Implement `/leave`**
   - Disconnects the bot from voice and destroys the session.
   - If the bot is not in a voice channel, reply with a message saying so.
   - Reply with confirmation: "Left the voice channel."

3. **Implement `/start`**
   - Starts the random sound loop on the current session.
   - If no session exists (bot not in a VC), reply with an error telling
     the user to `/join` first.
   - If already playing, reply saying it's already running.
   - Reply with confirmation including the current interval config:
     "Started! Playing random sounds every **30s - 5m**."

4. **Implement `/stop`**
   - Stops the random sound loop but keeps the bot in the voice channel.
   - If not currently playing, reply saying so.
   - Reply with confirmation: "Stopped. Use `/start` to resume or `/leave`
     to disconnect."

5. **Implement `/status`**
   - Shows the current state of the bot in this guild as an embed:
     - Connected channel (or "Not connected")
     - Playing status (active/stopped)
     - Current config (min/max interval, volume)
     - Sound library size
     - Next sound ETA (if playing)
     - Uptime
   - If no session exists, show a minimal status indicating the bot is idle.

---

## Epic 4.2: Configuration Commands

Commands to adjust the bot's behavior per guild.

### Stories

1. **Implement `/config`**
   - Subcommands or options to view and modify guild configuration:
     - `/config view` - shows current settings as an embed.
     - `/config set min_interval:<seconds> max_interval:<seconds> volume:<0.0-1.0>` -
       updates one or more settings. All options are optional; only provided
       values are changed.
   - Validate inputs:
     - `min_interval` must be >= 5 seconds (prevent spam).
     - `max_interval` must be >= `min_interval`.
     - `volume` must be between 0.0 and 1.0.
   - On set, update the config service (persists to JSON) and update the
     active session's scheduler/player if one exists.
   - Reply with the updated configuration.

2. **Implement `/config reset`**
   - Resets the guild's config to defaults.
   - Clears the guild entry from `data/config.json`.
   - If a session is active, update it with the default values.
   - Reply with confirmation showing the default values.

---

## Epic 4.3: Sound Management Commands

Commands to browse, add, and remove sounds from the library.

### Stories

1. **Implement `/sounds list`**
   - Lists all available sounds, grouped by category (subdirectory).
   - If there are many sounds, paginate the response (Discord message limit
     is 2000 chars; use embeds with fields or multiple messages if needed).
   - Show the total count in the footer.
   - Optional `category` parameter to filter by category.

2. **Implement `/sounds add`**
   - Accepts a file attachment on the slash command interaction.
   - Validates the file:
     - Must have a supported extension (.mp3, .wav, .ogg, .flac, .webm).
     - Must be under a reasonable size limit (e.g., 10 MB).
     - Filename must not conflict with an existing sound (or auto-rename).
   - Downloads the attachment and saves it to the `sounds/` directory.
   - Triggers a rescan of the sound library.
   - Optional `category` string parameter - if provided, saves to
     `sounds/<category>/` subdirectory.
   - Reply with confirmation: "Added **sound-name** to the library."

3. **Implement `/sounds remove`**
   - Takes a `name` string parameter (the sound name without extension).
   - Finds and deletes the sound file.
   - If the sound is not found, reply with an error.
   - Triggers a rescan.
   - Reply with confirmation.

4. **Implement `/sounds play`**
   - Takes a `name` string parameter.
   - Plays a specific sound immediately (outside the random loop).
   - Useful for previewing sounds or manually triggering one.
   - If the bot is not in a voice channel, reply with an error.
   - Does not affect the scheduler's timing.

---

## Completion Criteria

- [ ] All commands register successfully and appear in Discord's command menu.
- [ ] `/join` and `/leave` correctly manage voice channel presence.
- [ ] `/start` and `/stop` control the random sound loop.
- [ ] `/status` displays accurate, real-time information.
- [ ] `/config set` validates inputs and updates both persistent config and
      active session.
- [ ] `/sounds list` shows all sounds, handles large libraries gracefully.
- [ ] `/sounds add` accepts file uploads and adds them to the library.
- [ ] `/sounds remove` deletes sounds by name.
- [ ] `/sounds play` plays a specific sound on demand.
- [ ] Error cases produce helpful, user-friendly messages (not in VC, no
      session, invalid input, etc.).
- [ ] All command responses use embeds where appropriate for clean formatting.
