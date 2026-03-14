# Initiative 10: Access Control & Permission System

## Objective

Give server administrators fine-grained control over who can do what with the
bot. Today, any server member can change configuration, add or delete sounds,
and start or stop playback. This is fine for small friend groups but becomes a
problem in larger or more structured servers. This initiative introduces a
role-based permission system that maps Discord roles to bot capabilities,
a "DJ role" concept for delegated playback control, and per-channel command
restrictions.

---

## Epic 10.1: Permission Model Design

Define the permission model so it is simple enough for a casual server admin
to configure but expressive enough for complex server structures.

### Stories

1. **Define the `BotPermission` enum and `PermissionConfig` type**
   - Add to `src/types/index.ts`:
     ```ts
     type BotPermission =
       | 'MANAGE_SOUNDS'     // add, remove, background-tag sounds
       | 'MANAGE_CONFIG'     // /config set, /config reset, /scene create/delete
       | 'MANAGE_TRIGGERS'   // /trigger add, /trigger remove
       | 'MANAGE_SCHEDULES'  // /schedule add, /schedule remove
       | 'CONTROL_PLAYBACK'  // /join, /leave, /start, /stop, /sounds play
       | 'VIEW_STATUS';      // /status, /sounds list, /scene list, /help (default: everyone)

     interface RolePermissions {
       roleId: string;
       permissions: BotPermission[];
     }

     interface PermissionConfig {
       rolePermissions: RolePermissions[];
       commandChannelId: string | null;  // If set, bot only responds in this channel
       djRoleId: string | null;          // Shorthand for CONTROL_PLAYBACK permission
     }
     ```

2. **Default permission policy**
   - `VIEW_STATUS`: granted to `@everyone` (all members).
   - `CONTROL_PLAYBACK`: granted to `@everyone` by default (preserves current
     open behaviour). Can be restricted to a DJ role.
   - `MANAGE_SOUNDS`, `MANAGE_CONFIG`, `MANAGE_TRIGGERS`, `MANAGE_SCHEDULES`:
     granted only to members with the Discord `Manage Guild` permission by
     default. These defaults are not stored in config (they're implicit) and
     take effect unless explicitly overridden.
   - Bot owner / guild administrator always bypasses all checks.

3. **Permission evaluation logic**
   - `PermissionService` (`src/services/permission-service.ts`):
     - `hasPermission(member, permission, guildConfig)` — returns boolean.
     - Evaluation order:
       1. If the member has `Administrator` Discord permission → `true`.
       2. Check `PermissionConfig.rolePermissions` for any role the member has.
       3. Check DJ role shorthand for `CONTROL_PLAYBACK`.
       4. Fall back to defaults based on `Manage Guild` discord permission.
     - Inject `PermissionService` into all commands as a dependency.

---

## Epic 10.2: Enforcement in All Commands

Apply permission checks at the start of every command's `execute` function.

### Stories

1. **Central permission check helper**
   - Add a `requirePermission(interaction, permission, permissionService)` helper
     to `src/commands/types.ts`.
   - If the check fails, reply with a consistent denial embed: _"You don't have
     permission to use this command. Required permission: `MANAGE_SOUNDS`."_
   - Return `true` if permitted, `false` if denied (command exits early on
     `false`).

2. **Apply to each command**
   - `/join`, `/leave`, `/start`, `/stop`, `/sounds play` → `CONTROL_PLAYBACK`
   - `/sounds add`, `/sounds remove`, `/sounds background add/remove` → `MANAGE_SOUNDS`
   - `/config set`, `/config reset`, `/scene create`, `/scene delete` → `MANAGE_CONFIG`
   - `/trigger add`, `/trigger remove`, `/trigger toggle` → `MANAGE_TRIGGERS`
   - `/schedule add`, `/schedule remove`, `/schedule toggle` → `MANAGE_SCHEDULES`
   - `/status`, `/sounds list`, `/scene list`, `/schedule list`,
     `/trigger list`, `/help` → `VIEW_STATUS` (effectively public)

3. **Command channel restriction**
   - At the top of the interaction handler in `src/client.ts`, before routing
     to any command, check `PermissionConfig.commandChannelId`.
   - If set and the interaction's channel ID does not match, reply ephemerally:
     _"Bot commands are restricted to <#channel>."_
   - Allow `/help` to bypass this check (it should always be available).

---

## Epic 10.3: `/permissions` Command

Expose the permission system through a dedicated slash command.

### Stories

1. **`/permissions view`**
   - Show the current `PermissionConfig` in an embed:
     - DJ role (if set).
     - Command channel restriction (if set).
     - All role → permission mappings.
     - Effective defaults (read-only reference).
   - Requires `Manage Guild` Discord permission to run (not enforced via bot
     permission system — this command manages the permission system itself).

2. **`/permissions set-dj <role>`**
   - Set a Discord role as the DJ role, granting it `CONTROL_PLAYBACK`.
   - Confirm with the role name and what it now allows.

3. **`/permissions clear-dj`**
   - Remove the DJ role. `CONTROL_PLAYBACK` reverts to default (everyone).

4. **`/permissions grant <role> <permission>`**
   - Add a `BotPermission` to a role's permission list.
   - Permissions are displayed as a select menu of valid values.
   - Validate: role must exist in the guild, permission must be a valid
     `BotPermission` value.

5. **`/permissions revoke <role> <permission>`**
   - Remove a `BotPermission` from a role.
   - If the role then has an empty permission list, remove its entry entirely.

6. **`/permissions set-channel <channel>`**
   - Restrict bot command responses to the given text channel.
   - Confirm with the channel name.

7. **`/permissions clear-channel`**
   - Remove channel restriction; bot responds anywhere.

8. **`/permissions reset`**
   - Revert all permission config to defaults. Requires confirmation (reply with
     a confirm/cancel button row).

---

## Epic 10.4: Persistence & `ConfigService` Integration

Persist `PermissionConfig` alongside existing guild config.

### Stories

1. **Add `PermissionConfig` to guild config storage**
   - Extend `ConfigService` to read and write `permissionConfig` nested under
     each guild ID in `data/config.json`.
   - `ConfigService.getPermissionConfig(guildId)` — returns stored config
     merged with defaults.
   - `ConfigService.setPermissionConfig(guildId, partial)` — patch and persist.
   - `ConfigService.resetPermissionConfig(guildId)` — clear stored config.

2. **Inject `PermissionService` as a top-level dependency**
   - Wire into `src/index.ts` alongside `SoundLibrary`, `ConfigService`, etc.
   - Pass through `CommandDependencies` so all commands receive it.
   - `PermissionService` constructor takes `ConfigService` to load configs
     on demand (no caching needed; config reads are cheap).

---

## Completion Criteria

- [ ] A user without `CONTROL_PLAYBACK` permission cannot run `/join` or
      `/start`; they receive a clear denial message.
- [ ] A DJ role can be set with `/permissions set-dj`; members with that role
      can control playback even if `@everyone` can't.
- [ ] `Manage Guild` users can always run management commands regardless of
      the bot's role permission config.
- [ ] Administrators always bypass all checks.
- [ ] Command channel restriction silences bot responses in any other channel.
- [ ] `/permissions view` accurately reflects the current effective config.
- [ ] `PermissionService` has comprehensive unit tests covering role overlap,
      admin bypass, and default fallback logic.
- [ ] `ConfigService` correctly persists and loads `PermissionConfig`.
- [ ] No existing guild (with no permission config set) experiences any
      behaviour change — defaults match the current open-access model.
