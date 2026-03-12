# Initiative 2: Audio Engine & Voice Integration

## Objective

Build the audio infrastructure: voice channel connection management, audio
playback via FFmpeg and @discordjs/voice, and the file-based sound library
service. By the end of this initiative, the bot can join a voice channel,
play a sound file, and leave - all driven programmatically (not yet via
slash commands, which come in Initiative 4).

---

## Epic 2.1: Voice Connection Management

Handle joining and leaving Discord voice channels, including connection
lifecycle, error handling, and cleanup when the bot is disconnected
unexpectedly.

### Stories

1. **Create the voice manager service**
   - `src/services/audio-player.ts`: service that manages voice connections
     per guild.
   - `joinChannel(channel: VoiceBasedChannel)`: creates a voice connection
     using `joinVoiceChannel()` from `@discordjs/voice`, stores it keyed
     by guild ID.
   - `leaveChannel(guildId: string)`: destroys the voice connection and
     cleans up.
   - Handle the `VoiceConnectionStatus` lifecycle: `Ready`, `Disconnected`,
     `Destroyed`. Log transitions.

2. **Handle disconnection and cleanup edge cases**
   - If the voice connection enters `Disconnected` state, attempt to
     reconnect (with a reasonable timeout). If reconnection fails, clean up.
   - If the bot is the last member in the voice channel (everyone else left),
     optionally auto-disconnect (configurable behavior, default: stay).
   - When `Destroyed`, ensure any associated audio player is also stopped
     and cleaned up.
   - Handle the case where `joinChannel` is called while already connected
     to a different channel in the same guild (move to the new channel).

---

## Epic 2.2: Audio Playback Pipeline

Wire up the @discordjs/voice `AudioPlayer` to play sound files through a
voice connection, with volume control support.

### Stories

1. **Implement audio resource creation and playback**
   - In the audio player service, create an `AudioPlayer` instance per guild
     session.
   - Implement `playSound(filePath: string, volume: number)`:
     - Create an `AudioResource` using `createAudioResource(filePath)` with
       `inlineVolume: true` for volume control.
     - Set the volume on the resource's `volume` property.
     - Call `player.play(resource)`.
     - Subscribe the voice connection to the audio player.
   - Handle `AudioPlayerStatus` transitions: `Playing`, `Idle` (sound
     finished), `AutoPaused` (no connection).
   - Return a promise or fire a callback when the sound finishes playing, so
     the scheduler can queue the next interval.

2. **Validate FFmpeg availability on startup**
   - On bot startup, verify that FFmpeg is accessible (run
     `ffmpeg -version` as a child process).
   - If FFmpeg is not found, log a clear error message with installation
     instructions and exit.
   - This prevents confusing errors later when trying to play audio.

---

## Epic 2.3: Sound Library Service

Build the service that manages the local collection of sound files - scanning
the directory, filtering supported formats, and providing random selection.

### Stories

1. **Implement sound directory scanning**
   - `src/services/sound-library.ts`: service that manages the sound
     collection.
   - Constructor takes the sounds directory path.
   - `scan()`: recursively reads the sounds directory, collecting files with
     supported extensions (`.mp3`, `.wav`, `.ogg`, `.flac`, `.webm`).
   - Store as an array of `SoundFile` objects: `{ name, path, category }`.
     - `name`: filename without extension.
     - `path`: absolute file path.
     - `category`: subdirectory name (or "default" if at root level).
   - Call `scan()` on startup. Expose a `rescan()` method to refresh.

2. **Implement random sound selection and metadata**
   - `getRandomSound()`: returns a random `SoundFile` from the collection
     using `Math.random()`. Throw a descriptive error if the library is
     empty.
   - `getSounds()`: returns the full list of sounds (for the list command).
   - `getSoundCount()`: returns the total count.
   - `getSoundByName(name: string)`: find a specific sound by name.
   - `getCategories()`: returns the list of unique categories.
   - Avoid playing the same sound twice in a row - keep track of the last
     played sound and reroll if it matches (when library has > 1 sound).

3. **Support adding and removing sounds at runtime**
   - `addSound(fileName: string, data: Buffer)`: write the file to the
     sounds directory, rescan.
   - `removeSound(name: string)`: delete the file from disk, rescan.
   - Validate file extensions on add. Reject unsupported formats.
   - Sanitize filenames to prevent path traversal or special characters.

---

## Completion Criteria

- [ ] Bot can programmatically join a voice channel and establish a stable
      connection.
- [ ] Bot can play a `.mp3` or `.wav` file through the voice connection
      with audible output.
- [ ] Volume control works (audible difference between 0.2 and 1.0).
- [ ] Sound library scans the `sounds/` directory and lists found files.
- [ ] `getRandomSound()` returns a valid sound file path.
- [ ] Adding a file to `sounds/` and calling `rescan()` picks it up.
- [ ] Missing FFmpeg produces a clear error on startup.
