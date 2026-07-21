import { STATUS_PRIORITY, type ThreadState } from "./status.js";

type Listener = () => void;

/**
 * Keeps active tasks on stable physical keys while ensuring that the most
 * urgent tasks remain visible when more tasks exist than available keys.
 */
export class StableLaneBoard<T extends ThreadState> {
  private readonly lanes: Array<T | null>;
  private readonly listeners = new Set<Listener>();

  constructor(readonly capacity: number) {
    this.lanes = Array.from({ length: capacity }, () => null);
  }

  get(index: number): T | null {
    return this.lanes[index] ?? null;
  }

  update(states: Iterable<T>): void {
    const candidates = [...states]
      .filter((state) => state.status !== "idle")
      .sort(compareStates)
      .slice(0, this.capacity);
    const selected = new Map(candidates.map((state) => [state.id, state]));
    const next = this.lanes.map((state) => (state ? selected.get(state.id) ?? null : null));
    const assigned = new Set(next.flatMap((state) => (state ? [state.id] : [])));

    for (const state of candidates) {
      if (assigned.has(state.id)) continue;
      const free = next.indexOf(null);
      if (free < 0) break;
      next[free] = state;
      assigned.add(state.id);
    }

    const changed = next.some((state, index) => !sameState(state, this.lanes[index]));
    if (!changed) return;
    for (let index = 0; index < this.capacity; index += 1) this.lanes[index] = next[index];
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener();
    return () => this.listeners.delete(listener);
  }
}

function compareStates(a: ThreadState, b: ThreadState): number {
  return STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status] || b.updatedAt - a.updatedAt;
}

function sameState(a: ThreadState | null, b: ThreadState | null): boolean {
  return (
    a?.id === b?.id &&
    a?.status === b?.status &&
    a?.updatedAt === b?.updatedAt &&
    a?.path === b?.path
  );
}
