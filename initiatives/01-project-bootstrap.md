# Initiative 1: Project Bootstrap & Bot Foundation

## Objective

Stand up the project from scratch: repository structure, toolchain, Discord bot
client connected to the gateway, and the slash command framework wired and
ready. By the end of this initiative, the bot logs in, responds to a health-check
command, and cleanly shuts down.

---

## Epic 1.1: Project Scaffolding

Set up the foundational project structure, toolchain configuration, and
dependency manifest so that all subsequent work has a consistent base to build
on.

### Stories

1. **Initialize the Node.js project and install dependencies**
   - `npm init` with appropriate metadata (name: `discord-soundscape-bot`,
     etc.).
   - Install production deps: `discord.js`, `@discordjs/voice`, `sodium-native`,
     `prism-media`, `dotenv`.
   - Install dev deps: `typescript`, `tsx`, `@types/node`, `eslint`,
     `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`,
     `prettier`, `eslint-config-prettier`.
   - Set up npm scripts: `dev`, `build`, `start`, `lint`, `format`, `deploy`.

2. **Configure TypeScript, ESLint, and Prettier**
   - `tsconfig.json` with strict mode, ES2022 target, Node16 module resolution,
     `outDir: dist`, `rootDir: src`, path aliases if useful.
   - ESLint 9 flat config (`eslint.config.js`) with `@typescript-eslint/recommended`
     and prettier compat.
   - `.prettierrc` with singleQuote, trailingComma all, printWidth 80.

3. **Create the directory structure and boilerplate files**
   - Create `src/`, `src/commands/`, `src/services/`, `src/types/`, `src/util/`
     directories.
   - Create `sounds/` with `.gitkeep`.
   - Create `data/` with `.gitkeep`.
   - Create `scripts/` directory.
   - `.env.example` with all env vars documented.
   - `.gitignore` covering `node_modules`, `dist`, `data/`, `.env`, OS files.
   - Initialize git repo with initial commit.

---

## Epic 1.2: Bot Client & Gateway Connection

Get the Discord.js client created, configured, connected to the gateway, and
handling lifecycle events. The bot should come online and show as "online" in
Discord.

### Stories

1. **Create the entry point and environment loading**
   - `src/index.ts`: loads `.env` via dotenv, validates that `DISCORD_TOKEN`
     and `CLIENT_ID` are present, starts the bot.
   - Fail fast with a clear error message if required env vars are missing.
   - Wire up `process.on('SIGINT')` and `process.on('SIGTERM')` for graceful
     shutdown (destroy client, exit cleanly).

2. **Set up the Discord.js client with appropriate intents**
   - `src/client.ts`: create and export a `Client` with intents:
     `Guilds`, `GuildVoiceStates`.
   - No `MessageContent` intent needed (slash commands only).
   - Handle the `ready` event: log that the bot is online with its tag and
     the number of guilds it's in.
   - Handle the `error` and `warn` events with appropriate logging.

3. **Create the logger utility**
   - `src/util/logger.ts`: simple module wrapping `console.log/warn/error/debug`
     with `[INFO]`, `[WARN]`, `[ERROR]`, `[DEBUG]` prefixes and timestamps.
   - `debug` level gated behind `LOG_LEVEL` env var.
   - Used throughout the project instead of bare `console` calls.

---

## Epic 1.3: Slash Command Framework

Build the infrastructure for registering, loading, and routing slash commands.
Include one simple command (`/ping`) to validate the pipeline end-to-end.

### Stories

1. **Create the command definition interface and registry**
   - `src/types/index.ts`: define a `Command` interface with `data`
     (SlashCommandBuilder) and `execute` (function taking a
     `ChatInputCommandInteraction`).
   - `src/commands/index.ts`: export a function that collects all command
     modules into a `Collection<string, Command>`, and a `deployCommands`
     function that registers them with Discord's API (supporting both guild
     and global deployment based on whether `GUILD_ID` is set).

2. **Wire command routing into the client**
   - In `src/client.ts` (or `src/index.ts`), listen for the `interactionCreate`
     event.
   - Route `ChatInputCommandInteraction` to the matching command's `execute`
     function.
   - Handle unknown commands and execution errors gracefully (reply with an
     error message, log the error).

3. **Implement a `/ping` health-check command**
   - `src/commands/ping.ts`: responds with "Pong!" and the bot's WebSocket
     latency.
   - Use this command to validate the full pipeline: registration → interaction
     → response.
   - Create the `npm run deploy` script that calls `deployCommands` and exits.

---

## Completion Criteria

- [ ] `npm install` succeeds with no errors.
- [ ] `npm run lint` and `npm run build` pass cleanly.
- [ ] `npm run deploy` registers the `/ping` command with Discord.
- [ ] `npm run dev` starts the bot, which appears online in Discord.
- [ ] `/ping` responds with "Pong!" in a Discord server.
- [ ] Ctrl+C shuts down the bot cleanly with a log message.
