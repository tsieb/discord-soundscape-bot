# Initiative 14 — Density Curve Engine

## Overview

Replace the uniform random interval `[min, max]` with a **configurable probability distribution** for gap durations between sounds. The distribution can be shaped to create natural burstiness — a small cluster of sounds followed by a long silence — rather than mechanically even spacing.

---

## Problem Statement

The current scheduler draws gap durations uniformly from `[minInterval, maxInterval]`. This produces predictable, clock-like spacing that sounds artificial. Real ambient environments have irregular rhythms: a few sounds in quick succession, then silence, then a cluster again. Uniform random cannot model this.

The desired behavior:

- **Burst zone** (`0–8s`): small but real probability — sounds can cluster
- **Forbidden zone** (`10–30s`): near zero — gaps in this range feel awkward, neither "together" nor "apart"
- **Primary zone** (`30s–∞`): the main probability mass; probability rises from 30s, peaks around 60–120s, then slowly tapers

This creates a rhythm that feels alive: silence, then a little burst, then silence again.

---

## Goals

- Model gap duration as a user-defined probability distribution (not uniform)
- Provide sensible built-in presets (Ambient, Bursty, Sparse, Uniform)
- Store the curve as an editable JSON config
- Expose a curve editor in the local dashboard (Initiative 15)
- Zero breaking changes to existing scheduler API

---

## Mathematical Model

### Piecewise Linear PDF

The distribution is defined as a sorted array of `[time_seconds, density]` control points forming a piecewise linear curve. The area under the curve is normalized to 1 to form a valid PDF.

```ts
type CurvePoint = { t: number; d: number };   // time (seconds), density (arbitrary units)
type DensityCurve = CurvePoint[];
```

Example — default "Ambient" curve:

```json
[
  { "t": 0,   "d": 0.6 },
  { "t": 5,   "d": 1.0 },
  { "t": 10,  "d": 0.05 },
  { "t": 20,  "d": 0.01 },
  { "t": 30,  "d": 0.2 },
  { "t": 60,  "d": 4.0 },
  { "t": 120, "d": 6.0 },
  { "t": 240, "d": 3.5 },
  { "t": 480, "d": 1.0 }
]
```

This produces:
- ~5–8% of draws in the burst zone (0–10s)
- ~1% in the forbidden zone (10–30s)
- ~91% in the primary zone (30s+), peaking around 90–150s

### Sampling Algorithm

**Precompute CDF** when the curve is loaded or updated:

1. Walk each segment `[p_i, p_{i+1}]`
2. Compute the trapezoid area: `Δt × (d_i + d_{i+1}) / 2`
3. Build cumulative area array → divide by total area → CDF
4. Store the CDF as parallel arrays of `t[]` and `cdf[]`

**Draw a sample**:

1. `u = Math.random()` — uniform [0, 1]
2. Binary search for the segment where `cdf[k] ≤ u < cdf[k+1]`
3. Linear interpolation within the segment to find exact `t`

This is O(log n) per sample where n = number of control points (typically 8–20).

### Constraints

- At least 2 control points required
- All `t` values must be strictly increasing
- `t[0]` must be ≥ 0 (minimum gap, clamped to 1s internally)
- All `d` values must be ≥ 0; at least one must be > 0
- Effective maximum gap is `t[last]` — if a draw lands near the tail it may round to that value
- No requirement that the curve starts or ends at any specific density

---

## Built-in Presets

Stored in `src/data/curve-presets.ts` as constants (not user-editable, but referenceable):

| Preset | Description | Burst | Primary peak |
|---|---|---|---|
| `ambient` | Default. Natural feel with bursts. | 5–8% | 60–180s |
| `bursty` | Sounds cluster frequently. | 20% | 15–45s |
| `sparse` | Long silences, rare sounds. | 1% | 120–600s |
| `uniform` | Old behavior, uniform [min, max]. | n/a | user-configured |
| `heartbeat` | Regular with slight variation. | 0% | 60s ± 15s |

---

## New Service: `DensityCurveService`

```ts
class DensityCurveService {
  // Returns the active curve for a guild (or the global default)
  getCurve(guildId: string): DensityCurve

  // Replaces the curve and recomputes CDF. Validates curve before saving.
  setCurve(guildId: string, curve: DensityCurve): Promise<void>

  // Apply a named preset
  applyPreset(guildId: string, preset: CurvePresetName): Promise<void>

  // Sample a gap duration in seconds from the distribution
  sample(guildId: string): number

  // Get CDF data for dashboard visualization
  getCdfData(guildId: string): { t: number[]; cdf: number[] }
}
```

### Storage

File: `data/density-curves.json`

```json
{
  "guild_id_1": {
    "preset": "custom",
    "points": [
      { "t": 0, "d": 0.6 },
      ...
    ]
  }
}
```

If no entry exists for a guild, the `ambient` preset is used.

---

## Scheduler Integration

`Scheduler` currently computes delays with:

```ts
private calculateRandomDelayMs(): number {
  const randomDelaySeconds = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
  return Math.max(1, Math.round(randomDelaySeconds * 1000));
}
```

Extend `Scheduler` to accept an optional `sampleFn: (() => number) | null`. When provided, it is used instead of the uniform calculation. When null, falls back to the existing uniform logic.

```ts
constructor(
  minInterval: number,
  maxInterval: number,
  onTick: SchedulerTickHandler,
  sampleFn?: () => number,          // optional custom sampler
)
```

`SessionManager` passes `() => densityCurveService.sample(guildId)` when creating schedulers if a non-uniform preset is active.

The `minInterval` / `maxInterval` on `Scheduler` are preserved for:
1. The uniform fallback
2. The "Uniform" preset
3. Hard clamping of samples (a density-curve draw will be clamped to `[minInterval, maxInterval]` as a safety rail)

---

## Curve Validation

```ts
function validateCurve(points: CurvePoint[]): ValidationResult {
  if (points.length < 2) return { error: 'At least 2 points required' };
  for (let i = 1; i < points.length; i++) {
    if (points[i].t <= points[i - 1].t) return { error: `t values must be strictly increasing (index ${i})` };
    if (points[i].d < 0) return { error: `Density must be non-negative (index ${i})` };
  }
  if (!points.some(p => p.d > 0)) return { error: 'At least one density value must be > 0' };
  return { ok: true };
}
```

---

## Curve Editor UI (Companion to Initiative 15)

The curve editor is part of the local dashboard but described here for completeness.

### Canvas Layout

```
┌─────────────────────────────────────────────────────────┐
│  Gap Duration Distribution                [Presets ▼]   │
│                                                         │
│ PDF  ▲                                                  │
│      │        ●                                         │
│      │       / \                                        │
│      │      /   \                        ●              │
│   ●  │  ●  /     ●──────●          ●───/ \             │
│      │                       ●────/       \●            │
│      └──────┬────────┬───────────────┬────────────> t  │
│             10s      30s             2m      8m         │
│                                                         │
│  ○──────────────────────────────────────────────────    │
│  Histogram preview (1000 simulated draws)               │
└─────────────────────────────────────────────────────────┘
```

### Interactions

- **Drag control point**: mouse/touch drag updates `d` (vertical) or `t` (horizontal)
- **Click empty area**: add new control point
- **Right-click / double-click point**: delete control point (min 2 required)
- **Scroll to zoom**: expand/compress time axis
- **Preset dropdown**: load a named preset into the editor
- **Histogram preview**: auto-updates 500ms after any edit (1000 simulated draws rendered as a bar chart beneath the curve)
- **Save button**: writes to `data/density-curves.json` and triggers hot-reload in bot
- **Reset button**: reverts to last saved state

### Axis

- X axis: logarithmic time scale works well here (emphasizes the short-gap burst zone while still showing long gaps)
- Or: linear with a configurable visible range (e.g., 0–600s)
- Y axis: normalized density (0 to max density value in view)
- Grid lines at meaningful time milestones: 5s, 10s, 30s, 1m, 2m, 5m, 10m

---

## Discord Command: `/config density`

For when the dashboard is not available:

| Subcommand | Description |
|---|---|
| `/config density preset <name>` | Apply a named preset |
| `/config density view` | Show current preset name and peak gap time |
| `/config density reset` | Revert to ambient default |

Full curve editing via Discord is impractical (too many parameters) — this is intentionally limited. The dashboard is the primary curve editor.

---

## Epics

### Epic 14.1 — Core Math
- [ ] Implement `CurvePoint[]` type and `validateCurve()`
- [ ] Implement CDF precomputation (`buildCdf(points)`)
- [ ] Implement `sampleFromCdf(cdf, tArr)` using binary search + interpolation
- [ ] Unit tests: known distributions, edge cases (all-uniform segment, single spike)
- [ ] Fuzz test: verify 10,000 draws fall within expected quantiles for ambient preset

### Epic 14.2 — Preset Library
- [ ] Define the 5 named presets as constants
- [ ] Export `CurvePresetName` union type
- [ ] Unit test: each preset produces valid output from `sample()`

### Epic 14.3 — DensityCurveService
- [ ] File-backed storage in `data/density-curves.json`
- [ ] `getCurve`, `setCurve`, `applyPreset`, `sample`, `getCdfData`
- [ ] File-watcher (using `fs.watch`) to hot-reload curve when file changes externally
- [ ] Unit tests: persistence, validation rejection, preset application

### Epic 14.4 — Scheduler Integration
- [ ] Add optional `sampleFn` parameter to `Scheduler` constructor
- [ ] `SessionManager` injects `densityCurveService.sample` as `sampleFn`
- [ ] When `setCurve` is called live, propagate to active schedulers
- [ ] Integration test: sampled delays fall in expected range over many iterations

### Epic 14.5 — Discord Commands
- [ ] `/config density preset <name>` with autocomplete from preset list
- [ ] `/config density view` showing active preset + sample quantiles (p25, p50, p75)
- [ ] `/config density reset`

---

## Acceptance Criteria

- With `ambient` preset, manual test over 30 plays confirms: occasional short gaps, very few gaps in 10–30s range, majority of gaps > 30s
- With `uniform` preset, behavior is identical to current scheduler
- Changing preset via `/config density preset` takes effect within one scheduler cycle (no restart)
- Curve drawn in dashboard updates bot behavior within 2 seconds of saving
- All presets produce valid, non-crashing samples for at least 100,000 iterations
