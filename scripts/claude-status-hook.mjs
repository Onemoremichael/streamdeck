#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const input = JSON.parse(await readStdin());
const status = statusFromHook(input);
if (!status || typeof input.session_id !== "string") process.exit(0);

const root = process.env.CLAUDE_STREAM_DECK_STATE_DIR || join(homedir(), ".claude", "stream-deck", "state");
const sessionId = input.session_id.replace(/[^a-zA-Z0-9_-]/g, "_");
const path = join(root, `${sessionId}.json`);
const temporary = `${path}.${process.pid}.tmp`;

await mkdir(root, { recursive: true });
let previous = {};
try {
  previous = JSON.parse(await readFile(path, "utf8"));
} catch {
  // The first hook event creates the state file.
}

await writeFile(
  temporary,
  `${JSON.stringify({
    version: 1,
    sessionId: input.session_id,
    status,
    updatedAt: Date.now(),
    cwd: input.cwd ?? previous.cwd,
    transcriptPath: input.transcript_path ?? previous.transcriptPath
  })}\n`,
  "utf8"
);
await rename(temporary, path);

function statusFromHook(event) {
  switch (event.hook_event_name) {
    case "UserPromptSubmit":
    case "PreToolUse":
    case "PostToolUse":
    case "PostToolUseFailure":
      return "working";
    case "PermissionRequest":
      return "attention";
    case "Stop":
      return "ready";
    case "StopFailure":
      return "error";
    case "SessionEnd":
      return "idle";
    case "Notification":
      if (["permission_prompt", "idle_prompt", "elicitation_dialog"].includes(event.notification_type)) {
        return "attention";
      }
      if (["elicitation_complete", "elicitation_response"].includes(event.notification_type)) {
        return "working";
      }
      return null;
    default:
      return null;
  }
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}
