# Initiative 9: Layered Ambient Audio

## Objective

Upgrade the audio engine from a single-track random-interval player to a
two-layer system: a continuous **background layer** (a looping ambient track
playing at low volume) and the existing **foreground layer** (random sounds on
intervals). The combination produces a far richer, more immersive soundscape —
silence between foreground events is filled by a subtle bed of atmosphere
rather than dead air.

---

## Epic 9.1: Multi-Player Session Architecture

The current `Session` holds a single `AudioPlayer`. Extend it to hold multiple
named players so background and foreground can operate independently.

### Stories

1. **Extend the `Session` type**
   - Replace the single `audioPlayer: AudioPlayer` field with:
     ```ts
     audioPlayers: Map<'background' | 'foreground', AudioPlayer>;
     ```
   - Both players subscribe to the same `VoiceConnection`; Discord's voice
     system supports multiple simultaneous audio players on one connection via
     a `MixerStream`.
   - If `@discordjs/voice` does not expose a mixer directly, implement a
     lightweight PCM mixer that merges two Opus streams before encoding. Use
     the `prism-media` PassThrough approach: read both streams, mix sample
     values, clamp to [-1, 1], output as a single resource.
   - Prefer the simpler approach: play background as a resource on one player
     and foreground on another; let Discord handle the mix on the client side
     via two simultaneous subscriptions. Test whether Discord actually mixes
     or drops one stream. If only one stream plays at a time, implement the
     manual PCM mixer.

2. **`AudioPlayerService` multi-player support**
   - `registerGuildAudioPlayer` now accepts a `layer: 'background' | 'foreground'`
     parameter.
   - `playSound(guildId, filePath, volume, layer)` — routes to the correct
     player.
   - `stopLayer(guildId, layer)` — stops the specified player, leaves the other
     running.
   - Background player volume is independently capped: `effectiveVolume =
     min(requestedVolume, config.backgroundVolume)`.

3. **Backward compatibility**
   - All existing commands (`/start`, `/stop`, `/sounds play`, etc.) default
     to the `foreground` layer. No breaking changes.
   - If only one layer is active, the session behaves identically to the
     pre-initiative bot.

---

## Epic 9.2: Background Loop Player

Implement the background layer: selection, looping, seamless replay, and
volume management.

### Stories

1. **Background sound designation**
   - A sound can be designated as a "background track" by placing it in a
     `background/` or `loops/` category directory, or by the user explicitly
     tagging it (see Epic 9.3).
   - `SoundLibrary.getBackgroundTracks()` returns all sounds in background
     categories.
   - Background tracks are excluded from the foreground scheduler pool so they
     don't play as random foreground sounds.

2. **Seamless looping**
   - When the background player's `AudioPlayer` emits `AudioPlayerStatus.Idle`
     (track finished), immediately re-create the resource and play again.
   - This produces a seamless loop without gaps.
   - Handle the edge case where the track is very short (< 5 seconds): add a
     brief 500 ms pause between loops to avoid rapid re-trigger spam in error
     conditions.

3. **Background volume configuration**
   - Add `backgroundVolume: number` to `GuildConfig` (default `0.2`).
   - Add `backgroundEnabled: boolean` to `GuildConfig` (default `false` — opt
     in so existing users see no change).
   - Expose both via `/config set background_volume:<float>` and
     `/config set background_enabled:<true|false>`.

4. **Background crossfade on scene switch**
   - When the active scene changes, fade the current background track out over
     500 ms using the inline volume transform, then start the new background
     track at volume 0 and fade in.
   - If no background track matches the new scene's categories, stop the
     background layer gracefully.

---

## Epic 9.3: Background Track Management

Give users control over which sounds act as background tracks.

### Stories

1. **`/sounds background add <name>`**
   - Tag an existing sound as a background track.
   - Move the file to the `sounds/background/` directory (which creates the
     category automatically).
   - Rescan the library and resync schedulers.
   - If the sound was actively playing in the foreground, finish the current
     play and then exclude it going forward.

2. **`/sounds background remove <name>`**
   - Move the file out of the background directory and into
     `sounds/uncategorized/` (or its previous category if tracked).
   - It re-enters the foreground pool.

3. **`/sounds background list`**
   - Show all sounds currently designated as background tracks.
   - Include their duration (in seconds) if detectable via `ffprobe`.

4. **Background track auto-detection heuristic**
   - During `SoundLibrary.scan()`, flag sounds longer than 30 seconds as
     "background-eligible" and log a suggestion at `DEBUG` level.
   - Never auto-move files; only suggest via the suggestion flag.

---

## Epic 9.4: `/start` and `/stop` Layer Control

Extend the existing start/stop commands to operate on specific layers.

### Stories

1. **`/start [layer]`**
   - Optional `layer` parameter: `foreground` (default), `background`, `both`.
   - `both` starts the foreground scheduler and begins looping the background
     track (if `backgroundEnabled` is true and tracks exist).
   - If `backgroundEnabled` is `false` and the user runs `/start layer:both`,
     reply with a hint to enable background with `/config set background_enabled:true`.

2. **`/stop [layer]`**
   - Optional `layer` parameter: `foreground` (default), `background`, `both`.
   - Stopping only `background` pauses the loop but keeps foreground sounds
     firing.
   - Stopping only `foreground` silences the random sounds but the ambient
     background continues.

3. **`/status` layer status**
   - Add a "Layers" section to the status embed:
     - Foreground: ✅ Running / ⏸ Paused / ❌ No sounds
     - Background: ✅ Playing `<track name>` / ⏸ Paused / ❌ Disabled

---

## Completion Criteria

- [ ] Two independent audio players can operate simultaneously on the same
      voice connection, and both are audible to channel members.
- [ ] A sound in `sounds/background/` loops seamlessly without audible gaps.
- [ ] `/start layer:both` starts the foreground random loop and the background
      ambient track.
- [ ] `/stop layer:background` stops only the background loop; foreground
      continues.
- [ ] Background volume is configurable independently of foreground volume.
- [ ] Scene switching crossfades the background track in/out.
- [ ] `/sounds background add` and `/sounds background remove` correctly
      categorise sounds.
- [ ] Existing users with no background tracks see no behaviour change.
- [ ] All new audio-path code has integration tests; mixer logic (if
      implemented) has dedicated unit tests.
