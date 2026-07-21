import test from "node:test";
import assert from "node:assert/strict";
import { StableLaneBoard } from "../src/lanes.ts";

const state = (id, status, updatedAt) => ({ id, path: id, status, updatedAt });

test("assigns three active tasks to distinct lanes and leaves extra lanes idle", () => {
  const board = new StableLaneBoard(3);
  board.update([state("a", "working", 1), state("b", "working", 2)]);

  assert.deepEqual([board.get(0)?.id, board.get(1)?.id, board.get(2)?.id], ["b", "a", undefined]);
});

test("keeps selected tasks on stable lanes when their priority changes", () => {
  const board = new StableLaneBoard(3);
  board.update([
    state("a", "working", 1),
    state("b", "working", 2),
    state("c", "working", 3)
  ]);
  const original = [board.get(0)?.id, board.get(1)?.id, board.get(2)?.id];

  board.update([
    state("a", "attention", 4),
    state("b", "ready", 5),
    state("c", "working", 6)
  ]);

  assert.deepEqual([board.get(0)?.id, board.get(1)?.id, board.get(2)?.id], original);
  assert.equal(board.get(original.indexOf("a"))?.status, "attention");
});

test("releases idle tasks and promotes urgent overflow into the freed lane", () => {
  const board = new StableLaneBoard(3);
  board.update([
    state("a", "working", 1),
    state("b", "working", 2),
    state("c", "working", 3),
    state("hidden", "working", 0)
  ]);
  board.update([
    state("a", "idle", 4),
    state("b", "working", 2),
    state("c", "working", 3),
    state("urgent", "attention", 5)
  ]);

  assert.deepEqual(new Set([board.get(0)?.id, board.get(1)?.id, board.get(2)?.id]), new Set(["b", "c", "urgent"]));
});

test("displaces the least important visible task when all lanes are occupied", () => {
  const board = new StableLaneBoard(3);
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

  const visible = new Set([board.get(0)?.id, board.get(1)?.id, board.get(2)?.id]);
  assert.equal(visible.has("urgent"), true);
  assert.equal(visible.has("a"), false);
});
