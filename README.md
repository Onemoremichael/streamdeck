# Agent Attention for Stream Deck

Agent Attention turns Stream Deck keys into live indicators for local Codex tasks and Claude Code Desktop sessions on macOS. Add as many copies of either reusable action as your device and layout allow, then glance at the deck to see which agents are working, waiting for you, or ready to review.

This is an unofficial personal integration and is not published or endorsed by Anthropic, OpenAI, or Elgato. Claude, Codex, and their icons are trademarks or assets of their respective owners.

## Status colors

| Color | Label | Meaning |
| --- | --- | --- |
| White | `IDLE` | No unread task needs attention; the key may retain its last chat shortcut |
| Blue pulse | `WORKING` | An agent task is running |
| Green pulse | `READY` | A task completed and is ready to review |
| Amber pulse | `INPUT` | An agent is waiting for input or a permission decision |
| Red pulse | `ERROR` | A task failed or was aborted |

Each visible action copy becomes a task lane. Tasks keep stable physical keys while they remain among the most important tasks that fit on the available keys. When a task returns to idle, its key remembers that chat and remains a shortcut to it across plugin and Stream Deck restarts. New active tasks use never-assigned keys first, then replace the oldest idle binding when necessary. When more tasks are active than keys exist, the visible set is chosen by error, input, ready, working, then recency.

Recommended Stream Deck Mini layout:

```text
Codex 1    Codex 2    Codex 3
Claude 1   Claude 2   Claude 3
```

## Install

Requirements:

- macOS 13 or later
- Stream Deck 7.1 or later
- The ChatGPT/Codex desktop app with local Codex tasks
- Claude Desktop with Claude Code enabled for the Claude action

Build and install the plugin:

```sh
npm ci
npm run build
npm run pack
```

Double-click `com.onemoremichael.codex-attention.streamDeckPlugin`, restart Stream Deck if prompted, then drag either reusable action onto as many keys as you want:

- **Agent Attention → Codex Task**
- **Agent Attention → Claude Task**

For Claude Code Desktop, install the metadata-only lifecycle hooks once:

```sh
npm run install:claude-hooks
```

The installer preserves existing `~/.claude/settings.json` values and hooks, creates `~/.claude/settings.json.codex-attention-backup`, and adds the Claude status bridge. Claude normally reloads direct settings edits automatically; restart Claude Desktop if the hooks do not appear in `/hooks`.

For local Stream Deck development, link the plugin directory instead of repeatedly installing packages:

```sh
npx streamdeck link com.onemoremichael.codex-attention.sdPlugin
npx streamdeck restart com.onemoremichael.codex-attention
```

## Codex behavior

Pressing a Codex key opens the exact task assigned to that key in the signed ChatGPT/Codex desktop app through its `codex://threads/...` deep link, including when the key is idle. Pressing a ready or error key acknowledges the notification while retaining the chat shortcut.

The watcher follows recently modified Codex session journals and polls known journals every 500 ms to accommodate macOS file-event behavior. It recognizes:

- task start, completion, failure, and abort lifecycle records
- Codex input/elicitation requests
- explicit execution and patch approval requests
- current `tools.request_permissions(...)` permission cards
- escalated execution requests using `sandbox_permissions: "require_escalated"`

Internal guardian and other subagent journals are excluded so their completion cannot mask a user task or open a non-user-facing thread.

Escalated tool calls handled by Codex's automatic approval reviewer remain `WORKING`. The key changes to `INPUT` only for approval paths that can actually require the user, preventing brief amber flashes during ordinary thinking and tool execution.

Permission input is held on the key for at least one second, so a short request and its result cannot be collapsed into a single polling update.

Codex journal formats are internal and may change. The regression tests include the currently observed permission-card and lifecycle formats so compatibility failures are easier to identify.

## Claude Code Desktop behavior

Claude Code exposes official lifecycle hooks, so its action does not infer status from transcript contents:

- `UserPromptSubmit`, `PreToolUse`, and tool results set `WORKING`
- `PermissionRequest`, permission notifications, idle prompts, and elicitation dialogs set `INPUT`
- `Stop` sets `READY`
- `StopFailure` sets `ERROR`
- `SessionEnd` returns the session to `IDLE`

The hook writes only session ID, status, timestamp, working directory, and transcript path to `~/.claude/stream-deck/state/`. It never copies prompts, responses, command text, or permission contents. The Stream Deck plugin watches these small state files locally.

Pressing a Claude key foregrounds Claude Desktop and acknowledges the session displayed on that key when it is ready or in error. Claude Desktop registers the `claude://` scheme, but Anthropic does not currently document a stable per-session desktop deep link, so the plugin intentionally avoids guessing one.

## Privacy

The plugin and hook run locally. They use lifecycle metadata such as event type, tool name, call ID, status, timestamp, and session/thread ID. They do not transmit agent data or use message text to determine status.

## Troubleshooting

If an action does not appear, restart Stream Deck and verify the plugin is linked or installed. During development, reload only this plugin with:

```sh
npx streamdeck restart com.onemoremichael.codex-attention
```

If Codex working and ready states update but permission cards do not turn amber, capture the permission card and preserve the corresponding local journal long enough to add its event shape to `src/status.ts` and `test/status.test.js`.

If the Claude action stays idle, run `/hooks` in Claude Code and confirm the Agent Attention hooks are listed. Reinstall them after moving or replacing your Node.js runtime:

```sh
npm run install:claude-hooks
```

## Development

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run validate
npm run pack
npm run install:claude-hooks
```

The generated `sdPlugin/bin/` runtime and packaged `.streamDeckPlugin` file are intentionally ignored by Git. Run `npm run build` before validation, packaging, or linking a fresh checkout. Source changes should include matching tests when an agent event shape changes.
