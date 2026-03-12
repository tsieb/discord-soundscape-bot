# Agent Instructions

## How to Complete an Epic

This document provides step-by-step instructions for implementing a single epic from an initiative file. Follow every step in order. Do not skip steps.

---

### Phase 1: Orientation

Before writing any code, build a full understanding of what you are building and why.

1. **Read the project documentation.** Read these files completely:
   - `docs/PROJECT_BRIEF.md` — project vision, goals, non-goals, and core features.
   - `docs/ARCHITECTURE.md` — tech stack, system architecture diagram, directory structure, and key design decisions.
   - `docs/DEVELOPMENT_STANDARDS.md` — TypeScript rules, naming conventions, dependency injection, error handling, logging, code style, git conventions, and environment configuration.

2. **Read the full initiative file.** The initiative files live in `initiatives/` and are numbered (e.g., `01-project-bootstrap.md`). Read the entire initiative — not just your target epic — so you understand:
   - The initiative's overall objective.
   - How your epic relates to the epics before and after it within the initiative.
   - The initiative's completion criteria.

3. **Identify your epic.** Locate the specific epic section within the initiative file. Note:
   - The epic number (e.g., 2.1) and title.
   - The epic's objective paragraph.
   - Every story listed under the epic, including all bullet points and sub-bullets.
   - Any references to specific files, interfaces, methods, or behaviors.

4. **Read existing code that your epic touches.** If the epic modifies or extends existing files, read them in full before making changes. If the epic depends on services or types created by earlier epics, read those too. Never modify code you have not read.

---

### Phase 2: Branch Setup

Use the following branching model. Every branch name must be lowercase and use hyphens as separators.

```
main
 └── initiative/XX-short-name
      └── epic/XX.Y-short-name
```

- `main` is the stable trunk. It always builds and lints cleanly.
- Initiative branches are created from `main`. One per initiative.
- Epic branches are created from their parent initiative branch. One per epic.

**Steps:**

1. **Ensure you are on the latest `main`.**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create or check out the initiative branch.** If the initiative branch already exists, check it out and pull. If it does not exist, create it from `main`.
   ```bash
   # If the branch exists:
   git checkout initiative/XX-short-name
   git pull origin initiative/XX-short-name

   # If the branch does not exist:
   git checkout -b initiative/XX-short-name main
   git push -u origin initiative/XX-short-name
   ```
   Use the initiative number and a short kebab-case name derived from the initiative title. Examples:
   - `initiative/01-project-bootstrap`
   - `initiative/02-audio-engine`
   - `initiative/03-sound-scheduler`

3. **Create the epic branch from the initiative branch.**
   ```bash
   git checkout -b epic/XX.Y-short-name initiative/XX-short-name
   ```
   Use the epic number and a short kebab-case name derived from the epic title. Examples:
   - `epic/1.1-project-scaffolding`
   - `epic/2.3-sound-library`
   - `epic/3.2-session-manager`

---

### Phase 3: Implementation

Work through each story in the epic sequentially. Stories within an epic are ordered intentionally — later stories may depend on artifacts created by earlier ones.

#### For each story:

1. **Read the story requirements carefully.** Each story has a bold title and a set of bullet points describing what to build. Treat every bullet point as a requirement. Do not skip any.

2. **Write the code.** Follow all standards from `docs/DEVELOPMENT_STANDARDS.md`:
   - TypeScript strict mode. No `any`. Use `unknown` and narrow.
   - Named exports only. No default exports.
   - Filenames in kebab-case.
   - Classes in PascalCase, functions in camelCase, constants in UPPER_SNAKE_CASE.
   - Constructor injection for service dependencies. No singletons.
   - `async/await` over `.then()` chains.
   - Early returns to reduce nesting.
   - Explicit return types on exported functions.
   - Typed `Error` subclasses for domain errors.
   - Catch errors at command boundaries; let unexpected errors bubble up.
   - Log at service boundaries using `src/util/logger.ts`, not bare `console`.

3. **Validate your work.** After implementing each story, run:
   ```bash
   npm run lint          # Must pass with no errors or warnings
   npm run build         # Must compile with no TypeScript errors
   ```
   If either command fails, fix the issues before proceeding. Do not move to the next story with a broken build.

4. **Commit the story.** Make one commit per story (or per logical unit of work within a story if the story is large). Use conventional commit messages:
   ```
   feat: implement sound directory scanning
   fix: handle empty sound library in random selection
   chore: add supported audio extensions constant
   refactor: extract volume transform into helper
   docs: add JSDoc to scheduler public methods
   ```
   Rules for commits:
   - One logical change per commit.
   - The commit message subject line should be imperative mood, lowercase, and under 72 characters.
   - If more context is needed, add a blank line after the subject and write a body paragraph.
   - Never commit files containing secrets (`.env`, credentials, tokens). Check `git status` and `git diff --staged` before every commit.

---

### Phase 4: Verification

After all stories in the epic are implemented and committed:

1. **Run the full validation suite.**
   ```bash
   npm run lint          # ESLint must pass cleanly
   npm run build         # TypeScript must compile with no errors
   ```

2. **Review the epic's stories against your implementation.** Go back to the initiative file and re-read every bullet point under every story in the epic. For each bullet:
   - Confirm the behavior is implemented.
   - Confirm the file exists at the specified path (if a path was given).
   - Confirm the method signature matches (if a signature was specified).

3. **Review the initiative's completion criteria.** At the bottom of each initiative file there is a "Completion Criteria" checklist. Check every item that applies to your epic. Your epic does not need to satisfy all of them — some belong to other epics — but every criterion that falls within your epic's scope must be met.

4. **Test manually if applicable.** For epics that produce observable behavior (bot comes online, command responds, sound plays), test by running the bot:
   ```bash
   npm run dev
   ```
   Verify the behavior described in the epic works as expected. If the epic is purely structural (scaffolding, configuration, types), a clean build and lint is sufficient.

---

### Phase 5: Integration

Merge the completed epic back into its initiative branch.

1. **Push the epic branch.**
   ```bash
   git push -u origin epic/XX.Y-short-name
   ```

2. **Create a pull request** from the epic branch into the initiative branch. The PR should include:
   - **Title:** `Epic XX.Y: Short epic title`
   - **Body:**
     - A summary of what was implemented (one bullet per story).
     - A list of files created or modified.
     - Any known limitations, follow-ups, or deviations from the spec.
     - The results of `npm run lint` and `npm run build` (confirm they pass).

3. **Merge the PR** into the initiative branch after review. Use a merge commit (not squash) to preserve the per-story commit history.

4. **When all epics in an initiative are complete**, the initiative branch is merged into `main` via a pull request:
   - **Title:** `Initiative XX: Initiative title`
   - **Body:** Summary of all epics completed, completion criteria satisfied, and any deviations.
   - Merge into `main` using a merge commit.

5. **Do not delete branches after merging.** Keep initiative and epic branches for historical reference.

---

### Reference: Branching Lifecycle

```
main ─────────────────────────────●──────────── (initiative merged)
  \                              /
   initiative/01-bootstrap ─────●────────────── (epic merged)
     \                         /
      epic/1.1-scaffolding ───● (completed)
     \                       /
      epic/1.2-bot-client ──● (completed)
     \                     /
      epic/1.3-commands ──● (completed)
```

Each epic branch is short-lived: created, implemented, merged into the initiative branch, and done. The initiative branch accumulates all its epics, then merges into `main` when the initiative is complete.

---

### Reference: Standards Checklist

Use this as a quick pre-commit checklist. The full details are in `docs/DEVELOPMENT_STANDARDS.md`.

- [ ] TypeScript strict mode — no `any`, no implicit returns, no unused variables.
- [ ] Named exports only — no `export default`.
- [ ] Filenames in kebab-case — e.g., `sound-library.ts`, not `SoundLibrary.ts`.
- [ ] Constructor injection — services receive dependencies as constructor params.
- [ ] Error handling — typed `Error` subclasses, caught at command boundaries.
- [ ] Logging — use `src/util/logger.ts`, not `console.log`.
- [ ] `npm run lint` passes with zero errors and zero warnings.
- [ ] `npm run build` compiles with zero TypeScript errors.
- [ ] Conventional commit messages — `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`.
- [ ] No secrets in commits — `.env`, tokens, and credentials are never staged.
- [ ] One logical change per commit.

---

### Reference: File Placement

When creating new files, place them according to this convention:

| What you are creating | Where it goes | Naming |
|---|---|---|
| Slash command | `src/commands/command-name.ts` | kebab-case, one per file |
| Service / business logic | `src/services/service-name.ts` | kebab-case |
| Shared interface or type | `src/types/index.ts` | PascalCase inside the file |
| Utility function | `src/util/util-name.ts` | kebab-case |
| Script | `scripts/script-name.ts` | kebab-case |
| Sound file | `sounds/` or `sounds/category/` | any name, supported extensions only |

---

### Reference: Quick Commands

```bash
# Development
npm install              # Install dependencies
npm run dev              # Start bot with hot reload (tsx)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled JavaScript
npm run lint             # Run ESLint
npm run format           # Run Prettier
npm run deploy           # Register slash commands with Discord

# Git workflow for an epic
git checkout main && git pull origin main
git checkout initiative/XX-name        # or create with -b from main
git checkout -b epic/XX.Y-name         # create from initiative branch
# ... implement stories, commit each one ...
git push -u origin epic/XX.Y-name
# create PR: epic branch → initiative branch
# after all epics: create PR: initiative branch → main
```
