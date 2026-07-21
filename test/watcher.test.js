import test from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexJournalWatcher } from "../src/watcher.ts";

test("detects lifecycle records appended to an existing journal", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-attention-"));
  const day = join(root, "2026", "07", "20");
  const journal = join(day, "rollout-2026-07-20T00-00-00-019f8267-45b4-7352-9309-119b046ca40f.jsonl");
  await mkdir(day, { recursive: true });
  await writeFile(
    journal,
    `${JSON.stringify({ timestamp: new Date().toISOString(), type: "event_msg", payload: { type: "task_started" } })}\n`
  );

  const watcher = new CodexJournalWatcher(root);
  try {
    await watcher.start();
    await appendFile(
      journal,
      `${JSON.stringify({ timestamp: new Date().toISOString(), type: "event_msg", payload: { type: "task_complete" } })}\n`
    );

    const state = await waitForStatus(watcher, "ready", 2500);
    assert.equal(state?.id, "019f8267-45b4-7352-9309-119b046ca40f");
  } finally {
    watcher.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("does not collapse a short approval and its result into one update", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-attention-"));
  const day = join(root, "2026", "07", "20");
  const journal = join(day, "rollout-2026-07-20T00-00-00-019f8267-45b4-7352-9309-119b046ca40f.jsonl");
  await mkdir(day, { recursive: true });
  await writeFile(
    journal,
    `${JSON.stringify({ timestamp: new Date().toISOString(), type: "event_msg", payload: { type: "task_started" } })}\n`
  );

  const watcher = new CodexJournalWatcher(root);
  const observed = [];
  let unsubscribe = () => {};
  try {
    await watcher.start();
    unsubscribe = watcher.subscribe((state) => {
      if (state) observed.push({ status: state.status, at: Date.now() });
    });

    const callId = "call_approval_test";
    await appendFile(
      journal,
      [
        JSON.stringify({
          timestamp: new Date().toISOString(),
          type: "response_item",
          payload: {
            type: "custom_tool_call",
            name: "exec",
            call_id: callId,
            input: 'tools.exec_command({cmd:"date",sandbox_permissions:"require_escalated"})'
          }
        }),
        JSON.stringify({
          timestamp: new Date().toISOString(),
          type: "response_item",
          payload: { type: "custom_tool_call_output", call_id: callId }
        })
      ].join("\n") + "\n"
    );

    await waitForStatus(watcher, "working", 3000, true);
    const attention = observed.find((item) => item.status === "attention");
    const resumed = observed.find((item, index) => item.status === "working" && index > observed.indexOf(attention));
    assert.ok(attention, "attention was emitted");
    assert.ok(resumed, "working was emitted after attention");
    assert.ok(resumed.at - attention.at >= 900, "attention remained visible for about one second");
  } finally {
    unsubscribe();
    watcher.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("ignores internal subagent journals", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-attention-"));
  const day = join(root, "2026", "07", "20");
  const journal = join(day, "rollout-2026-07-20T00-00-00-019f82ab-358f-7030-9cea-d0c459771b84.jsonl");
  await mkdir(day, { recursive: true });
  await writeFile(
    journal,
    [
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: "session_meta",
        payload: { thread_source: "subagent", source: { subagent: { other: "guardian" } } }
      }),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: "event_msg",
        payload: { type: "task_started" }
      }),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        type: "event_msg",
        payload: { type: "task_complete" }
      })
    ].join("\n") + "\n"
  );

  const watcher = new CodexJournalWatcher(root);
  try {
    await watcher.start();
    assert.equal(watcher.states.size, 0);
    assert.equal(watcher.ignoredPaths.has(journal), true);
  } finally {
    watcher.stop();
    await rm(root, { recursive: true, force: true });
  }
});

function waitForStatus(watcher, expected, timeoutMs, requireTransition = false) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    let sawDifferentStatus = !requireTransition;
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${expected}`));
    }, timeoutMs);
    unsubscribe = watcher.subscribe((state) => {
      if (state?.status !== expected) sawDifferentStatus = true;
      if (state?.status !== expected || !sawDifferentStatus) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(state);
    });
  });
}
