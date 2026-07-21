#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const claudeRoot = process.env.CLAUDE_STREAM_DECK_CONFIG_DIR || join(homedir(), ".claude");
const installRoot = join(claudeRoot, "stream-deck");
const installedHook = join(installRoot, "claude-status-hook.mjs");
const settingsPath = join(claudeRoot, "settings.json");
const sourceHook = join(dirname(fileURLToPath(import.meta.url)), "claude-status-hook.mjs");
const marker = "claude-status-hook.mjs";

await mkdir(installRoot, { recursive: true });
await copyFile(sourceHook, installedHook);

let settings = {};
try {
  settings = JSON.parse(await readFile(settingsPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(installedHook)}`;
const hook = { type: "command", command, timeout: 10 };
const definitions = {
  UserPromptSubmit: {},
  PreToolUse: {},
  PermissionRequest: {},
  PostToolUse: {},
  PostToolUseFailure: {},
  Stop: {},
  StopFailure: {},
  SessionEnd: {},
  Notification: {
    matcher: "permission_prompt|idle_prompt|elicitation_dialog|elicitation_complete|elicitation_response"
  }
};

for (const [event, definition] of Object.entries(definitions)) {
  const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
  hooks[event] = [
    ...existing.filter((entry) => !JSON.stringify(entry).includes(marker)),
    { ...definition, hooks: [hook] }
  ];
}

const next = { ...settings, hooks };
const temporary = `${settingsPath}.${process.pid}.tmp`;
const backup = `${settingsPath}.codex-attention-backup`;
try {
  await copyFile(settingsPath, backup);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
await rename(temporary, settingsPath);

console.log(`Installed Claude Code status hook at ${installedHook}`);
console.log(`Updated ${settingsPath} (backup: ${backup})`);
