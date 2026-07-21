import test from "node:test";
import assert from "node:assert/strict";
import { highestPriority, statusFromRecord, threadIdFromPath } from "../src/status.ts";

test("maps Codex journal lifecycle records", () => {
  assert.equal(statusFromRecord({ type: "event_msg", payload: { type: "task_started" } }), "working");
  assert.equal(statusFromRecord({ type: "event_msg", payload: { type: "task_complete" } }), "ready");
  assert.equal(statusFromRecord({ type: "response_item", payload: { type: "function_call", name: "request_user_input" } }), "attention");
  assert.equal(
    statusFromRecord({
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "exec",
        input: 'const result = await tools.exec_command({cmd:"date",sandbox_permissions:"require_escalated"});'
      }
    }),
    "attention"
  );
  assert.equal(
    statusFromRecord({
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "exec",
        input:
          'const r = await tools.request_permissions({permissions:{file_system:{write:["/tmp/test"]}},reason:"test"});'
      }
    }),
    "attention"
  );
  assert.equal(
    statusFromRecord({ type: "response_item", payload: { type: "custom_tool_call_output" } }),
    "working"
  );
  assert.equal(statusFromRecord({ type: "event_msg", payload: { type: "turn_aborted" } }), "error");
});

test("does not mistake ordinary exec calls for approvals", () => {
  assert.equal(
    statusFromRecord({
      type: "response_item",
      payload: { type: "custom_tool_call", name: "exec", input: 'tools.exec_command({cmd:"date"})' }
    }),
    null
  );
});

test("chooses urgency first and recency second", () => {
  const winner = highestPriority([
    { id: "a", path: "a", status: "working", updatedAt: 20 },
    { id: "b", path: "b", status: "attention", updatedAt: 10 },
    { id: "c", path: "c", status: "ready", updatedAt: 30 }
  ]);
  assert.equal(winner?.id, "b");
});

test("extracts a thread id from a rollout path", () => {
  assert.equal(
    threadIdFromPath("/tmp/rollout-2026-07-20T22-00-33-019f8267-45b4-7352-9309-119b046ca40f.jsonl"),
    "019f8267-45b4-7352-9309-119b046ca40f"
  );
});
