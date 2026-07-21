import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("../scripts/claude-status-hook.mjs", import.meta.url));
const installer = fileURLToPath(new URL("../scripts/install-claude-hooks.mjs", import.meta.url));

test("Claude hook records permission and completion lifecycle states", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-attention-hook-"));
  const sessionId = "claude-session-test";
  try {
    await invokeHook(root, {
      session_id: sessionId,
      transcript_path: "/tmp/claude-transcript.jsonl",
      cwd: "/tmp/project",
      hook_event_name: "PermissionRequest",
      tool_name: "Bash"
    });
    let state = JSON.parse(await readFile(join(root, `${sessionId}.json`), "utf8"));
    assert.equal(state.status, "attention");
    assert.equal(state.cwd, "/tmp/project");

    await invokeHook(root, { session_id: sessionId, hook_event_name: "Stop" });
    state = JSON.parse(await readFile(join(root, `${sessionId}.json`), "utf8"));
    assert.equal(state.status, "ready");
    assert.equal(state.transcriptPath, "/tmp/claude-transcript.jsonl");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude notification hook maps elicitation dialogs to attention", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-attention-hook-"));
  try {
    await invokeHook(root, {
      session_id: "elicitation-test",
      hook_event_name: "Notification",
      notification_type: "elicitation_dialog"
    });
    const state = JSON.parse(await readFile(join(root, "elicitation-test.json"), "utf8"));
    assert.equal(state.status, "attention");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Claude hook installer preserves settings and installs every lifecycle event", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-attention-installer-"));
  try {
    await writeFile(
      join(root, "settings.json"),
      `${JSON.stringify({ effortLevel: "high", hooks: { Stop: [{ hooks: [{ type: "command", command: "existing" }] }] } })}\n`
    );
    await runScript(installer, { CLAUDE_STREAM_DECK_CONFIG_DIR: root });
    const settings = JSON.parse(await readFile(join(root, "settings.json"), "utf8"));
    assert.equal(settings.effortLevel, "high");
    assert.equal(settings.hooks.Stop.length, 2, "existing Stop hook is preserved");
    for (const event of [
      "UserPromptSubmit",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "PostToolUseFailure",
      "Stop",
      "StopFailure",
      "SessionEnd",
      "Notification"
    ]) {
      assert.ok(Array.isArray(settings.hooks[event]), `${event} hook is installed`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function invokeHook(root, input) {
  await runScript(hook, { CLAUDE_STREAM_DECK_STATE_DIR: root }, JSON.stringify(input));
}

async function runScript(script, extraEnv, input = "") {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...extraEnv },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let error = "";
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(error || `Hook exited with ${code}`));
    });
    child.stdin.end(input);
  });
}
