# Initiative 13 — Per-Sound Configuration

## Overview

Give each sound its own independent volume, playback frequency, and interval settings. This allows fine-grained tuning of the library: a rare dramatic sting can be configured to play once an hour, while a gentle ambient chime can play every few minutes, all without touching the guild-wide config.

---

## Problem Statement

Currently all sounds share a single `[minInterval, maxInterval]` range and a single master volume. Every sound is equally likely and equally loud. This makes it impossible to:

- Set a rare sound to play much less often than common ones
- Boost a quiet recording without boosting everything
- Temporarily silence a single sound that is getting annoying
- Give dramatic sounds a proper "rarity" feel

---

## Goals

- Per-sound volume multiplier (relative to master)
- Per-sound frequency weight (affects how often that sound's scheduler fires)
- Per-sound interval override (explicit min/max that supersedes guild config)
- Per-sound enabled/disabled toggle
- Commands that are discoverable and have autocomplete
- Persistent storage across restarts
- Live updates to running schedulers (no restart required)

---

## Non-Goals

- Per-user sound preferences (out of scope for a personal bot)
- Per-channel overrides (complexity not worth it)
- Scheduled enables/disables (that belongs in Initiative 7)

---

## Data Model

### `SoundConfig`

```ts
interface SoundConfig {
  volume: number;         // Multiplier applied on top of guild volume. Range: 0.0–2.0. Default: 1.0
  weight: number;         // Relative playback frequency. Range: 0.1–10.0. Default: 1.0
  enabled: boolean;       // Whether this sound participates in scheduling. Default: true
  minInterval?: number;   // Seconds. Overrides guild config if set. Must be > 0.
  maxInterval?: number;   // Seconds. Overrides guild config if set. Must be >= minInterval.
}
```

**Weight mechanics:** Weight is applied as an interval scale factor. A weight of 2.0 halves the effective interval (the sound fires twice as often). A weight of 0.5 doubles it (fires half as often). Formula:

```ts
const effectiveMin = (soundMin ?? guildMin) / weight;
const effectiveMax = (soundMax ?? guildMax) / weight;
```

This preserves the existing per-sound-scheduler architecture — no scheduler topology change needed.

### Storage

File: `data/sound-configs.json`

```json
{
  "guild_id_1": {
    "Rainstorm": { "volume": 0.8, "weight": 2.0, "enabled": true },
    "Thunderclap": { "volume": 1.4, "weight": 0.2, "enabled": true, "minInterval": 180, "maxInterval": 600 },
    "Crickets": { "volume": 1.0, "weight": 1.0, "enabled": false }
  }
}
```

Sounds not present in the file use defaults (no entry = default config). This keeps the file small and means adding a new sound file to disk requires no migration.

---

## New Service: `SoundConfigService`

Thin wrapper around the JSON file, mirroring the pattern of `ConfigService`.

```ts
class SoundConfigService {
  getSoundConfig(guildId: string, soundName: string): SoundConfig
  setSoundConfig(guildId: string, soundName: string, partial: Partial<SoundConfig>): Promise<void>
  resetSoundConfig(guildId: string, soundName: string): Promise<void>
  getAllSoundConfigs(guildId: string): Map<string, SoundConfig>
}
```

---

## Scheduler Integration

`SessionManager.createSession()` already builds one `Scheduler` per sound. Extend this to:

1. Read `SoundConfigService.getSoundConfig(guildId, soundName)` when creating each scheduler
2. Apply weight to compute effective intervals
3. Pass the per-sound volume multiplier into the tick handler alongside the sound
4. In `AudioPlayerService.playSound()`, accept an optional `volumeMultiplier` and multiply it against `config.volume` before setting the resource volume

When `setSoundConfig` is called while a session is active:
- If only `volume` changed: update in-memory, takes effect on next play
- If `weight`, `minInterval`, or `maxInterval` changed: call `scheduler.updateConfig(newMin, newMax)` on the affected scheduler (already supported by `Scheduler.updateConfig`)
- If `enabled` toggled to false: call `scheduler.stop()` and remove it from `soundSchedulers`
- If `enabled` toggled to true: create and start a new scheduler for that sound

---

## Commands

Extend `/sounds` with a `config` subcommand group.

### `/sounds config view [sound]`

Without argument: shows all sounds with a compact table (name, volume, weight, enabled, interval override if any).
With argument: shows detailed config for a single sound with descriptions of each field.

Autocomplete on `sound`: lists all sound names.

### `/sounds config set <sound> <field> <value>`

Fields exposed as separate subcommands for clarity:

| Subcommand | Option | Validation |
|---|---|---|
| `/sounds config volume <sound> <value>` | Float 0.0–2.0 | Reject out of range |
| `/sounds config weight <sound> <value>` | Float 0.1–10.0 | Reject out of range |
| `/sounds config interval <sound> <min> <max>` | Both seconds > 0, max ≥ min | Reject invalid |
| `/sounds config interval-reset <sound>` | — | Clears override, reverts to guild config |
| `/sounds config enable <sound>` | — | Enables scheduling |
| `/sounds config disable <sound>` | — | Disables scheduling |
| `/sounds config reset <sound>` | — | Resets all fields to defaults |

All commands respond with a confirmation embed showing the new state of that sound.

---

## Volume Display

Update `/status` and `/sounds list` to reflect per-sound overrides. In `/sounds list`, add a small indicator if a sound has non-default config (e.g., `⚙` suffix on the name).

---

## Epics

### Epic 13.1 — Data Layer
- [ ] Define `SoundConfig` type in `src/types/index.ts`
- [ ] Implement `SoundConfigService` with read/write/reset/getAll
- [ ] Unit tests: defaults, validation, persistence

### Epic 13.2 — Scheduler Integration
- [ ] Pass per-sound config into `SessionManager` scheduler creation
- [ ] Apply weight-based interval scaling
- [ ] Handle live config updates (volume, weight, enable/disable)
- [ ] Pass volume multiplier through to `AudioPlayerService`

### Epic 13.3 — Commands
- [ ] `/sounds config view` with full table and per-sound detail views
- [ ] `/sounds config volume`, `weight`, `interval`, `interval-reset`
- [ ] `/sounds config enable`, `disable`, `reset`
- [ ] Autocomplete for sound name argument on all subcommands
- [ ] Confirmation embeds with before/after values

### Epic 13.4 — Status Integration
- [ ] Update `/status` to mention that per-sound overrides are active (count)
- [ ] Update `/sounds list` with ⚙ indicator for configured sounds

---

## Acceptance Criteria

- Setting weight 0.1 on a sound demonstrably reduces how often it fires
- Setting volume 0.0 effectively silences a sound
- Disabling a sound mid-session stops its scheduler immediately without restarting the bot
- All sound-config changes persist across bot restarts
- `/sounds config view` shows the state of every sound in one embed
- Per-sound interval override takes precedence over guild config when set
