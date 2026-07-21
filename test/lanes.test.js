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
