import { STATUS_PRIORITY, type ThreadState } from "./status.js";

type Listener = () => void;

/**
 * Keeps active tasks on stable physical keys while ensuring that the most
 * urgent tasks remain visible when more tasks exist than registered keys.
 */
export class StableLaneBoard<T extends ThreadState> {
  private readonly slots: string[] = [];
  private readonly lanes = new Map<string, T>();
  private readonly listeners = new Set<Listener>();
  private states: T[] = [];

  get(slotId: string): T | null {
    return this.lanes.get(slotId) ?? null;
  }

  addSlot(slotId: string): void {
    if (this.slots.includes(slotId)) return;
    this.slots.push(slotId);
    this.reconcile();
  }

  removeSlot(slotId: string): void {
    const index = this.slots.indexOf(slotId);
    if (index < 0) return;
    this.slots.splice(index, 1);
    this.lanes.delete(slotId);
    this.reconcile();
  }

  update(states: Iterable<T>): void {
    this.states = [...states];
    this.reconcile();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener();
    return () => this.listeners.delete(listener);
  }

  private reconcile(): void {
    const candidates = this.states
      .filter((state) => state.status !== "idle")
      .sort(compareStates)
      .slice(0, this.slots.length);
    const selected = new Map(candidates.map((state) => [state.id, state]));
    const next = new Map<string, T>();
    const assigned = new Set<string>();

    for (const slotId of this.slots) {
      const current = this.lanes.get(slotId);
      const state = current ? selected.get(current.id) : undefined;
      if (!state) continue;
      next.set(slotId, state);
      assigned.add(state.id);
    }

    for (const state of candidates) {
      if (assigned.has(state.id)) continue;
      const free = this.slots.find((slotId) => !next.has(slotId));
      if (!free) break;
      next.set(free, state);
      assigned.add(state.id);
    }

    if (sameAssignments(next, this.lanes, this.slots)) return;
    this.lanes.clear();
    for (const [slotId, state] of next) this.lanes.set(slotId, state);
    for (const listener of this.listeners) listener();
  }
}

function compareStates(a: ThreadState, b: ThreadState): number {
  return STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status] || b.updatedAt - a.updatedAt;
}

function sameAssignments<T extends ThreadState>(
  a: Map<string, T>,
  b: Map<string, T>,
  slots: string[]
): boolean {
  return slots.every((slotId) => sameState(a.get(slotId) ?? null, b.get(slotId) ?? null));
}

function sameState(a: ThreadState | null, b: ThreadState | null): boolean {
  return (
    a?.id === b?.id &&
    a?.status === b?.status &&
    a?.updatedAt === b?.updatedAt &&
    a?.path === b?.path
  );
}
