import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeStateWatcher } from "../src/claude-watcher.ts";

test("Claude watcher follows hook state files and acknowledges completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "claude-attention-watcher-"));
  const path = join(root, "session-test.json");
  await mkdir(root, { recursive: true });
  await writeState(path, "ready");

  const watcher = new ClaudeStateWatcher(root);
  try {
    await watcher.start();
    assert.equal(current(watcher)?.status, "idle", "past completions seed as idle");

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeState(path, "attention");
    const attention = await waitForStatus(watcher, "attention", 2500);
    assert.equal(attention?.id, "session-test");

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeState(path, "ready");
    await waitForStatus(watcher, "ready", 2500);
    await watcher.acknowledge("session-test");
    assert.equal(current(watcher)?.status, "idle");
  } finally {
    watcher.stop();
    await rm(root, { recursive: true, force: true });
  }
});

function writeState(path, status) {
  return writeFile(
    path,
    `${JSON.stringify({
      version: 1,
      sessionId: "session-test",
      status,
      updatedAt: Date.now(),
      cwd: "/tmp/project",
      transcriptPath: "/tmp/transcript.jsonl"
    })}\n`,
    "utf8"
  );
}

function current(watcher) {
  let state = null;
  const unsubscribe = watcher.subscribe((next) => {
    state = next;
  });
  unsubscribe();
  return state;
}

function waitForStatus(watcher, expected, timeoutMs) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${expected}`));
    }, timeoutMs);
    unsubscribe = watcher.subscribe((state) => {
      if (state?.status !== expected) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(state);
    });
  });
}
