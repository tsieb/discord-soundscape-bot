# Initiative 8: Event-Triggered Sound Reactions

## Objective

Make the soundscape reactive. Rather than only playing sounds on a random
timer, the bot also responds to things that happen in the server: users
joining or leaving the voice channel, specific text appearing in chat, emoji
reactions, or custom Discord events. This turns the bot from a passive ambient
machine into a character that feels present and aware of its surroundings.

---

## Epic 8.1: Trigger System Architecture

Design a clean, extensible engine that maps Discord events to sound playback
without coupling event handling to individual commands.

### Stories

1. **Define the `Trigger` type**
   - Add to `src/types/index.ts`:
     ```ts
     type TriggerEventType =
       | 'voice_join'      // User joins the bot's voice channel
       | 'voice_leave'     // User leaves the bot's voice channel
       | 'keyword'         // A message in a watched text channel contains a keyword
       | 'reaction_add';   // A specific emoji is added to any message in a watched channel

     interface Trigger {
       readonly id: string;                // UUID
       readonly guildId: string;
       readonly eventType: TriggerEventType;
       readonly soundName: string;         // Sound to play (by name)
       readonly filter: TriggerFilter;     // Additional conditions
       readonly enabled: boolean;
       readonly cooldownSeconds: number;   // Min seconds between firings (default 30)
     }

     interface TriggerFilter {
       userId?: string;       // Only fire for this user (optional)
       keyword?: string;      // For 'keyword' events: the word/phrase to match
       emoji?: string;        // For 'reaction_add': emoji string or custom emoji ID
       channelId?: string;    // Text channel to watch for keyword/reaction triggers
     }
     ```

2. **`TriggerService`** (`src/services/trigger-service.ts`)
   - Persists all triggers to `data/triggers.json`, keyed by guild ID.
   - Methods:
     - `addTrigger(trigger)` — validate, assign UUID, persist. Max 20 per guild.
     - `removeTrigger(guildId, id)` — delete by ID.
     - `getTriggers(guildId)` — all triggers for a guild.
     - `getTriggersForEvent(guildId, eventType)` — filtered list.
     - `toggleTrigger(guildId, id, enabled)` — enable/disable.
     - `recordFire(guildId, id)` — update last-fired timestamp for cooldown tracking.
     - `isOnCooldown(guildId, id)` — check if cooldown has elapsed.
   - Inject into the Discord client setup alongside other services.

3. **`TriggerEngine`** (`src/services/trigger-engine.ts`)
   - Receives Discord gateway events (voice state updates, message creates,
     reaction adds) and evaluates matching triggers.
   - Wired in `src/client.ts` alongside the existing event handlers.
   - For each relevant event:
     1. Load all enabled triggers for the guild matching the event type.
     2. Apply filter conditions (userId, keyword match, emoji match,
        channelId).
     3. Check cooldown.
     4. If all conditions pass and the bot has an active session: call
        `SessionManager.playSoundNow(guildId, soundPath)`.
     5. Record the fire time via `TriggerService.recordFire()`.
   - Keyword matching: case-insensitive, whole-word boundary match using a
     simple `\b` regex. Does not require `MessageContent` privileged intent
     because it only watches channels explicitly configured per trigger.
   - No trigger fires if the bot has no active session in the guild (the bot
     must be in a voice channel to play anything).

---

## Epic 8.2: Voice Event Triggers

Implement the two voice-channel event types: user joins and user leaves.

### Stories

1. **Voice join trigger**
   - In the existing `VoiceStateUpdate` handler (already in
     `AudioPlayerService`), detect when a non-bot user joins the bot's voice
     channel.
   - Call `TriggerEngine.handleVoiceJoin(guildId, userId)`.
   - Example use case: play a short fanfare sound whenever a specific user
     joins.
   - A trigger with no `userId` filter fires for any user joining.

2. **Voice leave trigger**
   - Detect when a non-bot user leaves the bot's voice channel.
   - Call `TriggerEngine.handleVoiceLeave(guildId, userId)`.
   - Example use case: play a sad trombone sound when any user leaves.

3. **Avoid self-triggering on bot's own join/leave**
   - The `VoiceStateUpdate` handler already differentiates bot vs. user states;
     ensure trigger evaluation only fires for human users.
   - A user being moved between channels should fire both a leave and a join
     trigger for their respective channels.

---

## Epic 8.3: Text & Reaction Triggers

Implement keyword detection in messages and emoji reaction triggers.

### Stories

1. **Keyword trigger — `MessageCreate` handler**
   - Register a `messageCreate` handler in `src/client.ts`.
   - Only process messages in channels explicitly whitelisted by at least one
     keyword trigger (avoids scanning every message the bot can see).
   - Match using `\b<keyword>\b` case-insensitively.
   - Multiple keyword triggers can reference the same channel; each is
     evaluated independently.
   - Important: this feature requires the `GuildMessages` intent and the
     `MessageContent` privileged intent enabled in the Discord Developer Portal.
     Document this prerequisite clearly in the README and in the command's
     response.

2. **Reaction add trigger — `MessageReactionAdd` handler**
   - Register a `messageReactionAdd` handler.
   - Filter by `channelId` if set; otherwise watch guild-wide.
   - Match by emoji: Unicode emoji string (e.g., `🎉`) or custom emoji name
     (e.g., `poggers`).
   - Fires regardless of which message received the reaction.

3. **Partial message handling**
   - Discord.js may emit partial reaction/message events for messages not in
     the cache. Fetch the full message/reaction before evaluating if needed.
   - Handle fetch failures gracefully (log and skip).

---

## Epic 8.4: `/trigger` Command

Expose the trigger system through a slash command with five subcommands.

### Stories

1. **`/trigger list`**
   - Show all triggers for the guild in an embed.
   - Columns: ID (short), event type, sound name, filter summary, cooldown,
     status.

2. **`/trigger add voice-join <sound> [user] [cooldown]`**
   - Add a voice join trigger.
   - `sound`: autocomplete from available sounds.
   - `user`: optional user mention (if omitted, fires for anyone).
   - `cooldown`: seconds between firings (default 30, minimum 5).

3. **`/trigger add voice-leave <sound> [user] [cooldown]`**
   - Same as voice-join but for departures.

4. **`/trigger add keyword <sound> <keyword> <channel> [cooldown]`**
   - Add a text keyword trigger.
   - `channel`: the text channel to watch.
   - Show the `MessageContent` intent requirement warning in the response.

5. **`/trigger add reaction <sound> <emoji> [channel] [cooldown]`**
   - Add a reaction trigger.
   - `emoji`: any valid emoji input.
   - `channel`: optional channel scope (omit to watch guild-wide).

6. **`/trigger remove <id>`**
   - Delete a trigger by short ID.

7. **`/trigger toggle <id>`**
   - Enable or disable a trigger.

---

## Epic 8.5: Autocomplete for Sound Names

Since triggers reference sounds by name, implement autocomplete on sound-name
options in both the trigger and sounds commands.

### Stories

1. **Autocomplete handler**
   - Register an `interactionCreate` handler for `AutocompleteInteraction`.
   - When the focused option is a sound name field, query `SoundLibrary.getSounds()`
     and return up to 25 matches filtered by the current input value.
   - Sort results: exact prefix matches first, then substring matches.

2. **Apply autocomplete to all sound-name options**
   - `/trigger add voice-join <sound>` — autocomplete.
   - `/trigger add voice-leave <sound>` — autocomplete.
   - `/trigger add keyword <sound>` — autocomplete.
   - `/trigger add reaction <sound>` — autocomplete.
   - `/sounds play <name>` — autocomplete (retrofit existing command).

---

## Completion Criteria

- [ ] A voice-join trigger fires the configured sound when a user enters the
      voice channel, respecting the cooldown.
- [ ] A keyword trigger fires when a message containing the keyword is posted
      in the watched channel.
- [ ] A reaction trigger fires when the configured emoji is added to a message
      in the watched channel.
- [ ] Triggers with a `userId` filter only fire for that specific user.
- [ ] No trigger fires if the bot has no active session.
- [ ] Cooldown prevents a trigger from firing more than once per cooldown
      window.
- [ ] `/trigger list` shows all triggers with accurate filter summaries.
- [ ] Sound-name autocomplete works in all relevant command options.
- [ ] `TriggerEngine` and `TriggerService` have unit tests covering filter
      logic and cooldown checks.
- [ ] Maximum 20 triggers per guild is enforced.
