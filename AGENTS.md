# Agent Attention repository guide

This file applies to the entire repository. It is written for coding agents that are asked to install, configure, troubleshoot, or modify Agent Attention for Stream Deck.

## What this project does

Agent Attention is a macOS Stream Deck plugin with two reusable actions:

- **Agent Attention → Codex Task** watches local Codex task journals.
- **Agent Attention → Claude Task** receives metadata-only Claude Code lifecycle updates through hooks.

Users may place as many copies of either action as their Stream Deck layout allows. Do not reintroduce fixed numbered actions or fixed lane counts.

The stable plugin UUID is `com.onemoremichael.codex-attention`. The user-facing name is **Agent Attention**. Do not rename the UUID, action UUIDs, plugin directory, hook backup suffix, or package identifiers merely to match the newer branding; changing them breaks installed keys and saved per-key chat bindings.

## Set up this repository for a user

When a user asks an agent to set up this repository, perform the setup rather than only describing it. Work from the repository root.

1. Confirm the host is macOS 13 or later and that Stream Deck 7.1 or later is installed. Codex support requires the ChatGPT/Codex desktop app. Claude support requires Claude Desktop with Claude Code enabled.
2. Install dependencies and verify the source:

   ```sh
   npm ci
   npm run build
   npm run typecheck
   npm test
   npm run validate
   npm run pack
   ```

3. For a development checkout, prefer linking and reloading the plugin:

   ```sh
   npx streamdeck link com.onemoremichael.codex-attention.sdPlugin
   npx streamdeck restart com.onemoremichael.codex-attention
   ```

   These commands communicate with Stream Deck and may need permission to write outside the repository or control the running app. Request that permission normally; do not bypass the sandbox or macOS protections.

4. If linking is inappropriate or unavailable, open the generated `com.onemoremichael.codex-attention.streamDeckPlugin` package so Stream Deck can install it. Installing a package is a GUI action and may require user confirmation.
5. For Claude Code support, install the lifecycle hooks:

   ```sh
   npm run install:claude-hooks
   ```

   This intentionally writes to `~/.claude`, preserves existing settings and hooks, and creates `~/.claude/settings.json.codex-attention-backup`. Request filesystem approval when required. Do not overwrite Claude settings manually or discard unrelated hooks.
6. Tell the user to drag **Codex Task** and/or **Claude Task** from the **Agent Attention** category onto as many keys as desired. A useful Stream Deck Mini layout is three Codex keys above three Claude keys, but this is not a product limit.
7. Report which checks passed, whether the plugin was linked or installed, whether Claude hooks were installed, and any remaining user action.

## Verification and troubleshooting

- The generated runtime must exist at `com.onemoremichael.codex-attention.sdPlugin/bin/plugin.js` before validation, packaging, linking, or restarting.
- `npm run validate` must report success. `npm test` and `npm run typecheck` must also pass after source changes.
- The packed plugin is written to `com.onemoremichael.codex-attention.streamDeckPlugin` in the repository root.
- If actions do not appear, reload the plugin with `npx streamdeck restart com.onemoremichael.codex-attention`, then restart Stream Deck if necessary.
- If Claude remains idle, have the user run `/hooks` in Claude Code and confirm the Agent Attention hooks are present. Re-run `npm run install:claude-hooks` after Node.js is moved or replaced because the installed hook records an absolute Node path.
- A newly placed idle key has no chat shortcut until it has displayed a task once. Afterwards, it remembers its latest idle assignment. Active or urgent work may still reuse that key.
- Codex keys can reopen exact tasks through `codex://threads/<thread-id>`. Claude Desktop does not document a stable existing-session deep link, so Claude keys only foreground the app.

## Development rules

- Source lives in `src/`; tests live in `test/`; Claude hook scripts live in `scripts/`.
- `com.onemoremichael.codex-attention.sdPlugin/bin/` and `*.streamDeckPlugin` are generated and ignored by Git. Build them locally, but do not commit them.
- Keep the manifest, `package.json`, and root `package-lock.json` versions synchronized for releases.
- Stream Deck's pack command may remove the final newline from `manifest.json`; restore it before committing.
- Preserve unrelated user changes and existing Claude hooks.
- Add regression tests for new Codex journal event shapes, Claude hook mappings, lane assignment behavior, or saved-key behavior.
- Do not infer status from prompt or response text. The integration uses lifecycle metadata only and must not transmit task content.
- Auto-reviewed Codex escalations remain `WORKING`; only paths that can require the user should become `INPUT`.
- Do not commit or push unless the user explicitly asks.

## Architecture map

- `src/plugin.ts`: Stream Deck actions, rendering, key presses, and per-key saved assignments.
- `src/lanes.ts`: dynamic stable task-to-key allocation and idle fallback bindings.
- `src/watcher.ts`: Codex journal discovery and lifecycle tracking.
- `src/claude-watcher.ts`: Claude hook state-file tracking.
- `src/status.ts`: shared status mapping and priority rules.
- `scripts/claude-status-hook.mjs`: metadata-only Claude lifecycle hook.
- `scripts/install-claude-hooks.mjs`: safe Claude settings merger and hook installer.
- `README.md`: user-facing installation and behavior documentation.
