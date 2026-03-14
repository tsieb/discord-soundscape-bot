# Initiative 11: Interactive Soundboard

## Objective

Create a persistent Discord message — a "soundboard panel" — that lives in a
designated text channel and lets any user trigger sounds instantly by clicking
Discord button components. No slash commands, no typing: just click and hear.
The panel updates automatically as sounds are added or removed and supports
category tabs for navigating large libraries. This turns the bot into a live
interactive prop for voice sessions.

---

## Epic 11.1: Soundboard Panel Architecture

Design the panel as a persistent, editable Discord message with a well-defined
lifecycle.

### Stories

1. **Define the `SoundboardPanel` type**
   - Add to `src/types/index.ts`:
     ```ts
     interface SoundboardPanel {
       readonly guildId: string;
       readonly channelId: string;
       readonly messageId: string;     // ID of the pinned panel message
       readonly activePage: number;    // Current category/page index
       readonly pinnedSounds: string[]; // Sound names pinned to first row
     }
     ```

2. **`SoundboardService`** (`src/services/soundboard-service.ts`)
   - Persists one `SoundboardPanel` per guild to `data/soundboards.json`.
   - Methods:
     - `getPanel(guildId)` — return the active panel or `null`.
     - `savePanel(panel)` — persist.
     - `deletePanel(guildId)` — remove.
     - `pinSound(guildId, soundName)` — add to pinned list (max 5 pinned).
     - `unpinSound(guildId, soundName)` — remove from pinned list.
   - Inject into `src/index.ts` alongside other services.

3. **Panel message structure**
   - The panel is a single Discord message with:
     - An embed header: bot name, guild name, current category/page.
     - Up to 5 rows of buttons (`ActionRow`). Each row holds up to 5 buttons.
     - Row 0: pinned sounds (up to 5 buttons, always visible).
     - Rows 1–4: current page of sounds (up to 20 buttons per page).
     - Navigation row: "◀ Prev" / "▶ Next" category buttons + current page
       indicator (e.g., "forest — 2/3") + a "📌 Pin" toggle for the last
       played sound.
   - Button style: Primary (blue) for regular sounds, Success (green) for
     pinned sounds, Secondary (grey) for navigation.
   - Buttons are labelled with the sound's display name (truncated to 20 chars
     to fit Discord's limit).

4. **Panel renderer**
   - `src/util/soundboard-renderer.ts`: pure function
     `renderPanel(sounds, pinnedSounds, activePage, category)` → returns a
     `{ embeds, components }` object ready for Discord.js `MessageEditOptions`.
   - Stateless and easily unit-tested.
   - When the sound library has more sounds in a category than fit in 20
     buttons, split into pages within the category.

---

## Epic 11.2: Panel Lifecycle Commands

Expose panel creation, deletion, and configuration through `/soundboard`
subcommands.

### Stories

1. **`/soundboard create <channel>`**
   - Post the initial panel embed to the specified text channel.
   - Pin the message in the channel so it stays visible.
   - Save the message ID and channel ID to `SoundboardService`.
   - Only one panel per guild; if one already exists, prompt to replace or
     update instead.

2. **`/soundboard delete`**
   - Delete the panel message from Discord.
   - Unpin it first, then delete.
   - Remove the stored `SoundboardPanel`.

3. **`/soundboard refresh`**
   - Re-render and update the panel message in place (useful if sounds were
     added externally and the panel wasn't auto-updated).
   - Responds ephemerally to the user confirming the refresh.

4. **`/soundboard pin <sound>`**
   - Add a sound to the panel's pinned row.
   - Immediately re-renders the panel.
   - Max 5 pinned sounds; error clearly if limit reached.

5. **`/soundboard unpin <sound>`**
   - Remove a sound from the pinned row.
   - Immediately re-renders the panel.

---

## Epic 11.3: Button Interaction Handling

Handle button clicks on the soundboard panel and route them to playback or
navigation.

### Stories

1. **Button custom ID scheme**
   - Encode all necessary information in the button's `customId` to avoid
     stale state lookups:
     - Sound buttons: `sb:play:<guildId>:<soundName>`
     - Navigation: `sb:nav:<guildId>:<direction>` where direction is `prev`
       or `next`
     - Pin toggle: `sb:pin:<guildId>:<soundName>`
   - Parse `customId` in the `interactionCreate` handler, route to
     `SoundboardHandler`.

2. **`SoundboardHandler`** (`src/services/soundboard-handler.ts`)
   - `handlePlayButton(interaction, guildId, soundName)`:
     1. Check that the bot has an active session in the guild.
     2. Resolve the sound by name from `SoundLibrary`.
     3. Call `SessionManager.playSoundNow(guildId, sound.path)`.
     4. Acknowledge the interaction ephemerally: _"▶ Playing: rain-heavy"_.
     5. If no active session: ephemeral reply _"Join a voice channel and run
        `/join` first."_
   - `handleNavButton(interaction, guildId, direction)`:
     1. Load the panel from `SoundboardService`.
     2. Increment/decrement `activePage`, wrapping at boundaries.
     3. Save updated panel.
     4. Re-render and update the panel message.
     5. Acknowledge interaction (update the message — not ephemeral).
   - `handlePinButton(interaction, guildId, soundName)`:
     1. Toggle pin status via `SoundboardService`.
     2. Re-render panel.
     3. Ephemeral acknowledgement.

3. **Stale panel recovery**
   - If the panel message no longer exists in Discord (deleted externally),
     catch the `Unknown Message` API error and clear the stored panel.
   - On next button interaction with a stale panel ID, reply ephemerally:
     _"The soundboard panel was deleted. Recreate it with `/soundboard create`."_

---

## Epic 11.4: Auto-Update on Sound Library Changes

Keep the panel in sync whenever the sound library changes.

### Stories

1. **Hook into `SoundLibrary` mutation events**
   - After `addSound()` or `removeSound()` completes, emit an event (use
     Node.js `EventEmitter` on `SoundLibrary`): `'library:changed'`.
   - `SoundboardService` listens for `library:changed` and calls
     `refreshPanel(guildId)` for every guild that has an active panel.

2. **`refreshPanel(guildId)`**
   - Fetch the stored panel, re-render with the latest sound library snapshot,
     and edit the Discord message.
   - If the active page is now out of range (sounds were deleted), reset to
     page 0.
   - Handle rate-limiting gracefully: if a burst of additions triggers multiple
     refreshes, debounce with a 2-second delay so Discord isn't spammed with
     edits.

3. **Debounce utility**
   - `src/util/debounce.ts`: a simple `debounce<T>(fn, delayMs)` higher-order
     function.
   - Keeps the main code clean and is independently testable.

---

## Completion Criteria

- [ ] `/soundboard create #channel` posts a panel message and pins it.
- [ ] Sound buttons trigger immediate playback via `SessionManager.playSoundNow`.
- [ ] Navigation buttons page through categories without leaving voice or
      reissuing commands.
- [ ] Pinned sounds appear in the first row, persistently across page
      navigation.
- [ ] Adding a sound via `/sounds add` automatically updates the panel message
      within 2–5 seconds.
- [ ] Removing a sound updates the panel and adjusts the page if needed.
- [ ] Clicking a sound button with no active session produces a helpful
      ephemeral reply rather than an error.
- [ ] A stale (deleted) panel is gracefully detected and cleared.
- [ ] `soundboard-renderer.ts` is unit-tested for correct button layout across
      various library sizes and page states.
- [ ] Only one panel per guild; attempting to create a second prompts the user
      to replace or update.
