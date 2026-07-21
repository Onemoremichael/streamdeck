# Codex Attention for Stream Deck

Codex Attention turns one Stream Deck key into a live priority indicator for local Codex tasks on macOS. It mirrors the single-key workflow of Codex Micro: glance at the key to see whether Codex is working, waiting for you, or ready to review, then press it to open the relevant task.

This is an unofficial personal integration and is not published or endorsed by OpenAI or Elgato. Codex and its icon are trademarks or assets of OpenAI.

## Status colors

| Color | Label | Meaning |
| --- | --- | --- |
| White | `IDLE` | No unread task needs attention |
| Blue pulse | `WORKING` | A Codex task is running |
| Green pulse | `READY` | A task completed and is ready to review |
| Amber pulse | `INPUT` | Codex is waiting for input or a permission decision |
| Red pulse | `ERROR` | A task failed or was aborted |

When several tasks are active, the key shows the most urgent state: error, input, ready, working, then idle. Ties go to the most recently updated task.

## Install

Requirements:

- macOS 13 or later
- Stream Deck 7.1 or later
- The ChatGPT/Codex desktop app with local Codex tasks

Build and install the plugin:

```sh
npm ci
npm run build
npm run pack
```

Double-click `com.onemoremichael.codex-attention.streamDeckPlugin`, restart Stream Deck if prompted, then drag **Codex Attention → Priority Task** onto a key.

For local development, link the plugin directory instead of repeatedly installing packages:

```sh
npx streamdeck link com.onemoremichael.codex-attention.sdPlugin
npx streamdeck restart com.onemoremichael.codex-attention
```

## Behavior

Pressing the key opens the highest-priority task in the signed ChatGPT/Codex desktop app through its `codex://threads/...` deep link. Pressing a ready or error key also acknowledges that notification and returns it to idle.

The watcher follows recently modified Codex session journals and polls known journals every 500 ms to accommodate macOS file-event behavior. It recognizes:

- task start, completion, failure, and abort lifecycle records
- Codex input/elicitation requests
- explicit execution and patch approval requests
- current `tools.request_permissions(...)` permission cards
- escalated execution requests using `sandbox_permissions: "require_escalated"`

Permission input is held on the key for at least one second, so a short request and its result cannot be collapsed into a single polling update.

## Privacy

The plugin runs locally. It uses lifecycle metadata such as event type, tool name, call ID, status, timestamp, and thread ID. It does not transmit Codex data or use message text to determine status.

Codex journal formats are internal and may change. The regression tests include the currently observed permission-card and lifecycle formats so compatibility failures are easier to identify.

## Troubleshooting

If the action does not appear, restart Stream Deck and verify the plugin is linked or installed. During development, reload only this plugin with:

```sh
npx streamdeck restart com.onemoremichael.codex-attention
```

If working and ready states update but permission cards do not turn amber, capture the permission card and preserve the corresponding local journal long enough to add its event shape to `src/status.ts` and `test/status.test.js`.

## Development

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run validate
npm run pack
```

The packaged `.streamDeckPlugin` file is written to the repository root and is intentionally ignored by Git. Source changes should include matching tests when a Codex journal event shape changes.
