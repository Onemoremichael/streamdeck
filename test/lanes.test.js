import test from "node:test";
import assert from "node:assert/strict";
import { StableLaneBoard } from "../src/lanes.ts";

const state = (id, status, updatedAt) => ({ id, path: id, status, updatedAt });

test("assigns active tasks to every registered key and leaves extras idle", () => {
  const board = new StableLaneBoard();
  board.addSlot("key-1");
  board.addSlot("key-2");
  board.addSlot("key-3");
  board.update([state("a", "working", 1), state("b", "working", 2)]);

  assert.deepEqual(
    [board.get("key-1")?.id, board.get("key-2")?.id, board.get("key-3")?.id],
    ["b", "a", undefined]
  );
});

test("supports an arbitrary number of registered keys", () => {
  const board = new StableLaneBoard();
  const keys = Array.from({ length: 15 }, (_, index) => `key-${index}`);
  const tasks = Array.from({ length: 12 }, (_, index) => state(`task-${index}`, "working", index));
  for (const key of keys) board.addSlot(key);
  board.update(tasks);

  assert.equal(keys.filter((key) => board.get(key)).length, 12);
  assert.equal(new Set(keys.map((key) => board.get(key)?.id).filter(Boolean)).size, 12);
});

test("keeps selected tasks on stable keys when their priority changes", () => {
  const board = new StableLaneBoard();
  for (const key of ["key-1", "key-2", "key-3"]) board.addSlot(key);
  board.update([
    state("a", "working", 1),
    state("b", "working", 2),
    state("c", "working", 3)
  ]);
  const original = [board.get("key-1")?.id, board.get("key-2")?.id, board.get("key-3")?.id];

  board.update([
    state("a", "attention", 4),
    state("b", "ready", 5),
    state("c", "working", 6)
  ]);

  assert.deepEqual(
    [board.get("key-1")?.id, board.get("key-2")?.id, board.get("key-3")?.id],
    original
  );
});

test("retains the last task on its key after it becomes idle", () => {
  const board = new StableLaneBoard();
  board.addSlot("key-1");
  board.update([state("chat-a", "working", 1)]);
  board.update([state("chat-a", "idle", 2)]);

  assert.equal(board.get("key-1")?.id, "chat-a");
  assert.equal(board.get("key-1")?.status, "idle");
});

test("restores a persisted idle assignment when a key appears", () => {
  const board = new StableLaneBoard();
  board.addSlot("key-1", state("saved-chat", "idle", 0));

  assert.equal(board.get("key-1")?.id, "saved-chat");
  assert.equal(board.get("key-1")?.status, "idle");
});

test("uses empty keys before replacing retained idle assignments", () => {
  const board = new StableLaneBoard();
  board.addSlot("key-1", state("saved-chat", "idle", 10));
  board.addSlot("key-2");
  board.update([state("new-chat", "working", 20)]);

  assert.equal(board.get("key-1")?.id, "saved-chat");
  assert.equal(board.get("key-2")?.id, "new-chat");
});

test("replaces the oldest idle assignment when every key has history", () => {
  const board = new StableLaneBoard();
  board.addSlot("key-1", state("older-chat", "idle", 10));
  board.addSlot("key-2", state("newer-chat", "idle", 20));
  board.update([state("active-chat", "working", 30)]);

  assert.equal(board.get("key-1")?.id, "active-chat");
  assert.equal(board.get("key-2")?.id, "newer-chat");
});

test("adding and removing keys rebalances visible tasks", () => {
  const board = new StableLaneBoard();
  board.addSlot("key-1");
  board.update([state("a", "working", 1), state("b", "working", 2)]);
  assert.equal(board.get("key-1")?.id, "b");

  board.addSlot("key-2");
  assert.deepEqual(new Set([board.get("key-1")?.id, board.get("key-2")?.id]), new Set(["a", "b"]));

  board.removeSlot("key-1");
  assert.equal(board.get("key-1"), null);
  assert.equal(board.get("key-2")?.id, "b");
});

test("displaces the least important visible task when all keys are occupied", () => {
  const board = new StableLaneBoard();
  for (const key of ["key-1", "key-2", "key-3"]) board.addSlot(key);
  board.update([
    state("a", "working", 1),
    state("b", "working", 2),
    state("c", "working", 3)
  ]);
  board.update([
    state("a", "working", 1),
    state("b", "working", 2),
    state("c", "working", 3),
    state("urgent", "error", 4)
  ]);

  const visible = new Set([
    board.get("key-1")?.id,
    board.get("key-2")?.id,
    board.get("key-3")?.id
  ]);
  assert.equal(visible.has("urgent"), true);
  assert.equal(visible.has("a"), false);
});
