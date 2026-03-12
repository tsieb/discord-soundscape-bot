# Development Standards

## TypeScript

- **Strict mode** enabled (`"strict": true` in tsconfig.json).
- **ES2022** target with **Node16** module resolution.
- Prefer `interface` for object shapes, `type` for unions and intersections.
- Use `const` by default. Use `let` only when reassignment is necessary.
  Never use `var`.
- Prefer `async/await` over raw Promises. Avoid `.then()` chains.
- Use early returns to reduce nesting.
- Explicit return types on exported functions. Inferred types for internal/local
  functions are fine.
- No `any`. Use `unknown` when the type is genuinely unknown, then narrow.

## Naming Conventions

| Entity          | Convention       | Example                     |
|-----------------|------------------|-----------------------------|
| Files           | kebab-case       | `sound-library.ts`          |
| Classes         | PascalCase       | `SessionManager`            |
| Interfaces      | PascalCase       | `GuildConfig`               |
| Functions       | camelCase        | `getRandomSound()`          |
| Constants       | UPPER_SNAKE_CASE | `DEFAULT_MIN_INTERVAL`      |
| Variables       | camelCase        | `soundFiles`                |
| Type parameters | Single uppercase | `T`, `K`                    |

## Project Structure

- **`src/commands/`** - One file per slash command (or command group). Each
  exports a command definition object and an execute function.
- **`src/services/`** - Business logic. Services are plain classes or modules,
  not singletons. Instantiated in `index.ts` and passed where needed via
  constructor injection.
- **`src/types/`** - Shared interfaces and type definitions.
- **`src/util/`** - Pure utility functions with no side effects.

## Dependency Injection (Lightweight)

Services receive their dependencies via constructor parameters rather than
importing singletons. This keeps the code testable and makes dependencies
explicit. The composition root is `src/index.ts` where everything is wired up.

```typescript
// Good - explicit dependency
class SessionManager {
  constructor(
    private soundLibrary: SoundLibrary,
    private configService: ConfigService,
  ) {}
}

// Avoid - hidden singleton
import { soundLibrary } from './sound-library';
class SessionManager {
  doThing() { soundLibrary.pick(); }
}
```

## Error Handling

- Use typed Error subclasses for domain errors (e.g., `SoundNotFoundError`).
- Catch errors at command boundaries (the command handler) and respond with
  user-friendly messages.
- Let unexpected errors bubble up to the global `unhandledRejection` handler
  which logs and optionally notifies.
- Never swallow errors silently. At minimum, log them.

## Logging

- Use a simple logger utility (`src/util/logger.ts`) that wraps `console` with
  prefixed levels: `info`, `warn`, `error`, `debug`.
- Debug logging gated behind an env var (`LOG_LEVEL=debug`).
- Log at service boundaries: when a session starts/stops, when a sound plays,
  when config changes. Not on every function call.

## Code Style (ESLint + Prettier)

- ESLint 9 flat config with `@typescript-eslint/recommended`.
- Prettier defaults with these overrides:
  - `singleQuote: true`
  - `trailingComma: 'all'`
  - `printWidth: 80`
  - `semi: true`
- Run `npm run lint` before committing. Lint errors are blockers.

## Git

- Conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Small, focused commits. One logical change per commit.
- `main` branch is always runnable.

## Environment Configuration

All runtime configuration via environment variables (loaded from `.env`):

| Variable            | Required | Description                          | Default |
|---------------------|----------|--------------------------------------|---------|
| `DISCORD_TOKEN`     | Yes      | Bot token from Discord Dev Portal.   | -       |
| `CLIENT_ID`         | Yes      | Bot application client ID.           | -       |
| `GUILD_ID`          | No       | Dev guild for instant command deploy. | -      |
| `DEFAULT_MIN_INTERVAL` | No   | Default min seconds between sounds.  | 30      |
| `DEFAULT_MAX_INTERVAL` | No   | Default max seconds between sounds.  | 300     |
| `DEFAULT_VOLUME`    | No       | Default volume (0.0 - 1.0).          | 0.5     |
| `LOG_LEVEL`         | No       | Logging verbosity.                   | info    |
| `SOUNDS_DIR`        | No       | Path to sounds directory.            | ./sounds|
| `DATA_DIR`          | No       | Path to data directory.              | ./data  |

## Testing Strategy (Post-MVP)

For MVP, manual testing is sufficient given the interactive nature of the bot.
Post-MVP considerations:
- Unit tests for pure logic: `Scheduler` timing calculations, `SoundLibrary`
  file filtering, `ConfigService` validation.
- Integration tests can mock the Discord client.
- Framework: Vitest (fast, TypeScript-native, compatible with Node.js).
