# Initiative 15 — Local Control Dashboard

## Overview

A localhost web dashboard that runs inside the bot process. Gives the bot owner a real-time visual interface for everything that is otherwise scattered across slash commands: per-sound controls, the density curve editor, live session state, and master playback controls. Since this is a personal bot, no auth is needed — it only listens on localhost.

---

## Problem Statement

Slash commands are great for Discord-native control, but they are awkward for configuration that involves:

- Sliders (volume is a number between 0 and 2 — slash commands have no slider)
- Curve editing (density distribution has 8–20 control points)
- Scanning 30+ sounds at once (list embeds paginate and hide context)
- Real-time feedback (slash command responses are static)

A local dashboard solves all of this without adding any external dependency or hosting complexity.

---

## Goals

- Single-page app served by the bot process on `localhost:4242`
- Real-time session updates via Server-Sent Events (SSE)
- Full per-sound controls (volume, weight, enable/disable, interval override)
- Density curve editor (Initiative 14's interactive canvas)
- Master controls: volume, start/stop, join/leave
- Play any sound immediately from the UI
- Works whether or not Discord is active (degrades gracefully if no session)
- No external auth, no framework dependencies, no separate process to start

---

## Non-Goals

- Mobile-friendly design (desktop only is fine for a personal tool)
- Remote access / reverse proxy (localhost only)
- Multi-guild UI (all controls affect the single active guild / the first active session)
- Replaces slash commands (dashboard is additive, not a replacement)

---

## Architecture

### Server

A small Express HTTP server is started alongside the Discord client in `src/index.ts`. It is injected with references to the same service instances the bot uses (`SessionManager`, `SoundLibrary`, `ConfigService`, `SoundConfigService`, `DensityCurveService`).

```
src/
  dashboard/
    server.ts          — Express app factory, registers routes, SSE broadcaster
    routes/
      sounds.ts        — GET/PATCH /api/sounds, POST /api/sounds/:name/play
      config.ts        — GET/PATCH /api/config
      density.ts       — GET/PUT /api/density-curve
      session.ts       — GET /api/session, POST /api/session/start|stop
      events.ts        — GET /api/events  (SSE stream)
    public/
      index.html       — Single HTML file (styles inlined or one linked .css)
      app.js           — Vanilla JS SPA
      curve-editor.js  — Canvas-based curve editor (self-contained module)
```

### Frontend

Vanilla HTML + CSS + JS. No bundler, no framework. The public files are served statically by Express. This keeps the footprint tiny, the startup instant, and there are no build steps.

The frontend connects to the SSE endpoint on load and reacts to events to keep all panels live.

---

## REST API

All endpoints return JSON. Errors return `{ error: string }` with appropriate HTTP status.

### Sounds

```
GET  /api/sounds
     → { sounds: Array<{ name, category, path, config: SoundConfig, lastPlayed: string | null }> }

PATCH /api/sounds/:name
     Body: Partial<SoundConfig>  (volume, weight, enabled, minInterval, maxInterval)
     → { name, config: SoundConfig }

POST  /api/sounds/:name/play
     → 204 or { error }
```

### Config

```
GET  /api/config
     → GuildConfig

PATCH /api/config
     Body: Partial<GuildConfig>
     → GuildConfig
```

### Density Curve

```
GET  /api/density-curve
     → { preset: string, points: CurvePoint[], cdf: { t: number[], cdf: number[] } }

PUT  /api/density-curve
     Body: { points: CurvePoint[] }
     → { points, cdf }  (validated and saved)

POST /api/density-curve/preset
     Body: { preset: CurvePresetName }
     → { preset, points, cdf }
```

### Session

```
GET  /api/session
     → { active: bool, guildId, channelId, isPlaying, uptime, nextSoundEta, recentPlays: string[] }

POST /api/session/start
     → 204 or { error }

POST /api/session/stop
     → 204 or { error }
```

### Events (SSE)

```
GET  /api/events
     Content-Type: text/event-stream

Event types:
  session_update   — full session snapshot
  sound_played     — { name, category, timestamp }
  config_changed   — { field, value }
  curve_changed    — new curve points
  sound_config_changed — { name, config }
```

The SSE broadcaster is called from service hooks (SessionManager emits events, DensityCurveService broadcasts on save, etc.).

---

## UI Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  🎵 Soundscape Bot  ●  Guild: My Server  ●  Connected 2h 14m           │
│  [Start] [Stop] [Leave]              Master Vol: ████░░ 50%            │
├────────────────┬───────────────────────────────────────────────────────┤
│  NOW PLAYING   │  SOUNDS  (32 sounds)          [Filter: all ▼]  [⚙ 5] │
│  ───────────   │  ─────────────────────────────────────────────────    │
│  Crickets      │  ☑ Crickets     Vol: ██░ 80%  Wt: ●─ 1.0  [▶]       │
│  0:00:03 ago   │  ☑ Thunderclap  Vol: ████ 1.4 Wt: ●─ 0.2  [▶]  [⚙] │
│                │  ☑ Rainstorm    Vol: ███░ 1.0 Wt: ●─ 2.0  [▶]       │
│  NEXT SOUND    │  ☐ Gnome        Vol: ████ 1.0 Wt: ●─ 1.0  [▶]       │
│  in ~1m 42s    │  ...                                                  │
│                ├───────────────────────────────────────────────────────┤
│  RECENT PLAYS  │  DENSITY CURVE                   [Presets ▼] [Save]  │
│  ─────────────  │                                                       │
│  Rainstorm     │  PDF ▲   ●                                            │
│  Thunderclap   │       │  │╲                              ●            │
│  Wind          │  ●    │  │ ╲                         ●──╱ ╲           │
│  Crickets      │  ─────┼──┼──●────────●──────────●──╱     ╲●──────>t │
│  Owl           │       0  5  10       30          60  120   300       │
│                │                                                       │
│                │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  histogram (simulated)  │
└────────────────┴───────────────────────────────────────────────────────┘
```

### Sounds Panel (right, top half)

- Scrollable list of all sounds
- Per-row controls:
  - Checkbox: enabled/disabled toggle (PATCH immediately on change)
  - Name + category badge
  - Volume slider (0.0–2.0, step 0.05)
  - Weight slider (0.1–10.0, log scale feels better here)
  - [▶] button: play immediately
  - [⚙] badge: shown when sound has non-default config, click to expand detail row
- Expand detail row shows:
  - Interval override fields (min/max seconds, empty = use guild default)
  - [Reset to defaults] button
- Filter dropdown: All, by category, Only customized, Only disabled
- Slider changes debounce 400ms before sending PATCH

### Density Curve Editor (right, bottom half)

Described in detail in Initiative 14. Key interaction notes for the dashboard context:

- Editor canvas is ~600×200px
- Log-scale time axis (feels more natural for gap times spanning 0–600s)
- Histogram of 500 simulated draws shown below the curve, auto-updates 500ms after any drag
- Preset dropdown applies preset into editor without saving
- Save button PATCHes `/api/density-curve` and triggers SSE broadcast
- Undo/redo: Ctrl+Z / Ctrl+Y cycle through last 10 curve states (in-memory only)

### Session Panel (left)

- Now Playing: sound name, time since played, waveform flash animation when a sound plays
- Next Sound: countdown timer (computed from SSE `session_update` events)
- Recent Plays: rolling list of last 10 sounds, newest at top
- Start/Stop/Leave buttons: POST to `/api/session/*`
- Master volume slider: PATCH `/api/config`

---

## Bot-Side Integration

### Startup

`src/index.ts` creates the dashboard server after services are initialized:

```ts
import { createDashboardServer } from './dashboard/server';

const port = parseInt(process.env.DASHBOARD_PORT ?? '4242', 10);
const dashboard = createDashboardServer({ sessionManager, soundLibrary, configService, soundConfigService, densityCurveService });
dashboard.listen(port, 'localhost', () => {
  logger.info(`Dashboard listening on http://localhost:${port}`);
});
```

### Event Plumbing

Services emit Node.js `EventEmitter` events (or accept a broadcaster callback). The SSE route subscribes to these and forwards them to connected browsers. This is a lightweight internal event bus — no new dependency needed.

```ts
// SessionManager emits:
sessionManager.on('sound_played', (guildId, soundName) => { ... })
sessionManager.on('session_update', (guildId, snapshot) => { ... })

// DensityCurveService emits:
densityCurveService.on('curve_changed', (guildId, newCurve) => { ... })
```

### Graceful Shutdown

On SIGINT/SIGTERM, `dashboard.close()` is called as part of the existing shutdown sequence.

---

## Configuration

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PORT` | `4242` | Port to listen on |
| `DASHBOARD_ENABLED` | `true` | Set to `false` to disable entirely |

---

## Dependencies

No new frontend dependencies. For the server:

- `express` — already likely a familiar pattern; add as a new dependency
- No template engine needed (static HTML)
- No authentication middleware (localhost only)

Estimated addition: ~120KB to `node_modules`, zero impact on bot startup time (server starts async).

---

## Epics

### Epic 15.1 — Express Server & SSE
- [ ] `createDashboardServer()` factory, static file serving
- [ ] SSE endpoint with keep-alive and client reconnect support
- [ ] EventEmitter integration with `SessionManager`
- [ ] Graceful shutdown wiring

### Epic 15.2 — REST API
- [ ] `/api/sounds` GET + PATCH + play
- [ ] `/api/config` GET + PATCH
- [ ] `/api/density-curve` GET + PUT + preset
- [ ] `/api/session` GET + start/stop
- [ ] Input validation (reuse service-layer validators)
- [ ] Integration tests using supertest

### Epic 15.3 — Frontend Shell
- [ ] `index.html` with grid layout and CSS variables for theming
- [ ] SSE client with auto-reconnect
- [ ] Session panel (now playing, countdown, recent plays)
- [ ] Master controls (volume slider, start/stop/leave buttons)

### Epic 15.4 — Sounds Panel
- [ ] Scrollable sound list with per-row controls
- [ ] Debounced PATCH on slider changes
- [ ] Checkbox for enable/disable
- [ ] Expand detail row with interval overrides
- [ ] Filter dropdown
- [ ] [▶] play button

### Epic 15.5 — Curve Editor
- [ ] Canvas rendering of piecewise linear curve
- [ ] Log-scale time axis with labeled grid
- [ ] Draggable control points (mouse + touch)
- [ ] Click to add, right-click/double-click to remove
- [ ] Histogram preview (500 simulated draws, auto-update)
- [ ] Preset dropdown
- [ ] Save button with success/error feedback
- [ ] Undo/redo (10-state history)

---

## Acceptance Criteria

- `http://localhost:4242` opens and shows correct session state within 1s of bot startup
- Dragging a volume slider updates the sound's volume in the running session within 1s
- Editing and saving the density curve causes the next scheduler draw to use the new distribution
- Playing a sound via [▶] button immediately triggers playback (or returns an error if no session)
- Refreshing the page recovers full current state (no stale UI)
- `DASHBOARD_ENABLED=false` prevents the server from starting (no port binding)
