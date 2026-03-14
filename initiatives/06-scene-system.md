# Initiative 6: Mood & Scene System

## Objective

Give users a one-command way to shape the entire feel of a soundscape session.
A "scene" bundles together a category filter, an interval profile, and a volume
curve into a named preset (e.g., _Forest_, _Tavern_, _Horror_, _Study Hall_).
Users can apply built-in scenes or build their own. By the end of this
initiative the bot has a rich, personality-driven playback experience that goes
well beyond raw interval tuning.

---

## Epic 6.1: Scene Data Model & Storage

Define what a scene is, where it lives, and how it is persisted alongside the
existing guild config.

### Stories

1. **Define the `Scene` type**
   - Add to `src/types/index.ts`:
     ```ts
     interface Scene {
       readonly name: string;           // Unique identifier within the guild
       readonly displayName: string;    // Human-friendly label
       readonly description: string;    // One-line description shown in embeds
       readonly categories: string[];   // Sound categories to draw from (empty = all)
       readonly minInterval: number;    // Override min interval (seconds)
       readonly maxInterval: number;    // Override max interval (seconds)
       readonly volume: number;         // Override volume 0.0–1.0
       readonly builtIn: boolean;       // Cannot be deleted if true
     }
     ```
   - Extend `GuildConfig` with an optional `activeScene: string | null` and a
     `customScenes: Scene[]` array (default `[]`).

2. **Built-in scene catalogue**
   - Create `src/data/built-in-scenes.ts` exporting an array of `Scene` objects:
     | Name         | Categories           | Min  | Max   | Volume | Description                          |
     |--------------|----------------------|------|-------|--------|--------------------------------------|
     | `forest`     | nature, ambient      | 60   | 240   | 0.45   | Birds, wind, rustling leaves          |
     | `tavern`     | crowd, music, fx     | 20   | 90    | 0.65   | Chatter, clinking mugs, distant lute  |
     | `horror`     | horror, tension      | 45   | 300   | 0.55   | Creaks, distant screams, breathing    |
     | `study-hall` | ambient, soft        | 120  | 600   | 0.30   | Rare, soft sounds — great for focus   |
     | `arcade`     | retro, fx            | 10   | 60    | 0.60   | 8-bit bleeps, coin sounds, game over  |
     | `storm`      | weather, nature      | 15   | 120   | 0.70   | Thunder, rain, wind gusts             |
     | `space`      | sci-fi, ambient      | 90   | 480   | 0.40   | Beeps, hums, distant transmissions    |
   - Each scene's `categories` list is advisory: if no sounds in a category
     exist, the bot falls back to the full library with a log warning.

3. **Persist active scene in `ConfigService`**
   - `ConfigService.setActiveScene(guildId, sceneName)` — validate scene exists
     (built-in or custom), then write `activeScene` to `data/config.json`.
   - `ConfigService.clearActiveScene(guildId)` — set to `null`.
   - `ConfigService.getActiveScene(guildId)` — return the active `Scene` object
     or `null`.
   - On `getConfig`, merge active scene's interval/volume into the returned
     `GuildConfig` so that all downstream code (Scheduler, AudioPlayer) picks
     up the scene values automatically with no further changes.

---

## Epic 6.2: Scene-Aware Sound Filtering

Make the `SoundLibrary` and `SessionManager` respect the active scene's
category filter when selecting which sounds to schedule.

### Stories

1. **Category-filtered sound access in `SoundLibrary`**
   - Add `getSoundsForCategories(categories: string[]): SoundFile[]` — returns
     sounds whose category is in the list. Empty list returns all sounds (no
     filter).
   - Add `getRandomSoundForCategories(categories: string[]): SoundFile | null`
     — same anti-repeat logic as `getRandomSound()` but scoped to the filtered
     set.
   - Update `SessionManager.syncAllSessionSoundSchedulers()` to call the
     category-filtered method when a scene is active, so only relevant sounds
     are scheduled.

2. **Graceful fallback when filtered set is empty**
   - If active scene categories yield zero sounds, log a warning and fall back
     to the full library rather than stopping playback.
   - Include a hint in the `/status` output: _"Scene filter active — 3 of 12
     sounds in scope (forest, ambient)"_.

3. **Live scene switching without restart**
   - When the active scene changes mid-session, `SessionManager` tears down
     existing schedulers and rebuilds them with the new category filter and
     interval profile — no `/leave` + `/join` required.

---

## Epic 6.3: `/scene` Command

Expose the scene system to users through a clean slash command with four
subcommands.

### Stories

1. **`/scene list`**
   - Display all available scenes (built-in + guild custom) in a paginated
     embed.
   - Each row: scene name, description, category hints, interval range, volume.
   - Highlight the currently active scene with a visual indicator.

2. **`/scene set <name>`**
   - Activate a named scene for the guild.
   - If a session is active, live-switch immediately and confirm with an embed
     showing the new scene details.
   - If no session is active, store the preference for next `/join`.

3. **`/scene create <name> <display_name> <min_interval> <max_interval> <volume> [categories]`**
   - Create a custom scene unique to the guild.
   - `categories` is an optional comma-separated list of existing category names.
   - Validate: name is alphanumeric+dashes, name not already taken, intervals
     ≥5s, min < max, volume 0.0–1.0.
   - Cap custom scenes at 10 per guild.
   - Confirm with an embed summarising the new scene.

4. **`/scene delete <name>`**
   - Remove a custom (non-built-in) scene.
   - If the deleted scene was active, clear the active scene and revert to raw
     guild config.
   - Require the user to have `Manage Guild` permission or a configured DJ role.

5. **`/scene clear`**
   - Deactivate the current scene, returning to plain guild config values.

---

## Epic 6.4: Scene Awareness in `/status` and `/config`

Surface scene information in the existing status and config commands so users
always know what mode the bot is in.

### Stories

1. **`/status` scene block**
   - Add a "Scene" field to the status embed: show the active scene's display
     name and description, or _"None (using raw config)"_ if no scene active.
   - Show the effective interval range and volume (which may differ from stored
     config when a scene is active).

2. **`/config set` warning**
   - If a scene is active and the user runs `/config set`, reply with a
     warning: _"A scene is active — custom config changes won't take effect
     until the scene is cleared with `/scene clear`."_
   - Do not silently overwrite scene values; store the config change for when
     the scene is eventually cleared.

---

## Completion Criteria

- [ ] Seven built-in scenes are defined, each with distinct interval and volume
      profiles.
- [ ] `/scene list` shows all scenes with clear descriptions.
- [ ] `/scene set forest` activates the Forest scene; `/status` reflects the
      change.
- [ ] When the Forest scene is active, only sounds in `nature`/`ambient`
      categories are scheduled (or full library if none exist).
- [ ] Switching scenes during an active session restarts schedulers without a
      `/leave`.
- [ ] Custom scenes can be created and deleted by users with correct
      permissions.
- [ ] `/status` clearly shows the active scene and effective config values.
- [ ] All new code paths have unit tests with ≥90% branch coverage.
