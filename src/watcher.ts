import { watch, type FSWatcher } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { highestPriority, statusFromRecord, threadIdFromPath, type ThreadState } from "./status.js";

type Listener = (state: ThreadState | null) => void;

export class CodexJournalWatcher {
  readonly root: string;
  readonly states = new Map<string, ThreadState>();
  readonly offsets = new Map<string, number>();
  readonly partialLines = new Map<string, string>();
  readonly listeners = new Set<Listener>();
  readonly ignoredPaths = new Set<string>();
  private readonly attentionObservedAt = new Map<string, number>();
  private watcher: FSWatcher | null = null;
  private processing = new Map<string, Promise<void>>();
  private pollTimer: NodeJS.Timeout | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;

  constructor(root: string) {
    this.root = root;
  }

  async start(): Promise<void> {
    await this.seedExistingSessions();
    this.watcher = watch(this.root, { recursive: true }, (_event, filename) => {
      if (!filename?.endsWith(".jsonl")) return;
      const path = join(this.root, filename);
      void this.queue(path, true);
    });

    // FSEvents does not reliably report content-only appends for files beneath
    // a recursively watched directory. Poll the small set of known recent
    // journals so state changes are still delivered promptly.
    this.pollTimer = setInterval(() => {
      for (const path of this.offsets.keys()) void this.queue(path, true);
    }, 500);

    // Discover journals created after startup. This scan is deliberately less
    // frequent; once discovered, the journal joins the fast polling set above.
    this.discoveryTimer = setInterval(() => {
      void this.discoverNewSessions();
    }, 3000);
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    this.pollTimer = null;
    this.discoveryTimer = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(highestPriority(this.states.values()));
    return () => this.listeners.delete(listener);
  }

  acknowledge(threadId: string): void {
    const state = this.states.get(threadId);
    if (!state || (state.status !== "ready" && state.status !== "error")) return;
    this.states.set(threadId, { ...state, status: "idle", updatedAt: Date.now() });
    this.emit();
  }

  private emit(): void {
    const current = highestPriority(this.states.values());
    for (const listener of this.listeners) listener(current);
  }

  private async seedExistingSessions(): Promise<void> {
    const paths = await collectRecentJournals(this.root, 12);
    await Promise.all(paths.map((path) => this.queue(path, false)));

    // A past completion is not a new unread event. Preserve only genuinely
    // in-progress, waiting, or failed work when the plugin starts.
    for (const [id, state] of this.states) {
      const isStale = Date.now() - state.updatedAt > 6 * 60 * 60 * 1000;
      if (state.status === "ready" || state.status === "error" || isStale) {
        this.states.set(id, { ...state, status: "idle" });
      }
    }
    this.emit();
  }

  private async discoverNewSessions(): Promise<void> {
    const paths = await collectRecentJournals(this.root, 12);
    await Promise.all(paths.map((path) => this.queue(path, true)));
  }

  private queue(path: string, live: boolean): Promise<void> {
    const previous = this.processing.get(path) ?? Promise.resolve();
    const next = previous
      .then(() => this.readChanges(path, live))
      .catch(() => undefined)
      .finally(() => {
        if (this.processing.get(path) === next) this.processing.delete(path);
      });
    this.processing.set(path, next);
    return next;
  }

  private async readChanges(path: string, live: boolean): Promise<void> {
    const threadId = threadIdFromPath(path);
    if (!threadId) return;

    const file = await open(path, "r");
    try {
      const info = await file.stat();
      const knownOffset = this.offsets.get(path);
      const initialTailBytes = 4 * 1024 * 1024;
      const offset = Math.min(
        knownOffset ?? (!live ? Math.max(0, info.size - initialTailBytes) : 0),
        info.size
      );
      if (info.size === offset) return;

      const buffer = Buffer.alloc(info.size - offset);
      await file.read(buffer, 0, buffer.length, offset);
      this.offsets.set(path, info.size);

      let text = buffer.toString("utf8");
      if (knownOffset === undefined && offset > 0) {
        const firstNewline = text.indexOf("\n");
        text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
      }
      const combined = (this.partialLines.get(path) ?? "") + text;
      const lines = combined.split("\n");
      this.partialLines.set(path, lines.pop() ?? "");

      for (const line of lines) {
        if (!line) continue;
        try {
          const record = JSON.parse(line);
          if (record.type === "session_meta" && isSubagentSession(record.payload)) {
            this.ignoredPaths.add(path);
            const removed = this.states.delete(threadId);
            if (removed && live) this.emit();
            return;
          }
          if (this.ignoredPaths.has(path)) return;

          const status = statusFromRecord(record);
          if (!status) continue;

          // A poll can receive both an approval request and its result in the
          // same read. Deliver each lifecycle transition instead of collapsing
          // the batch to its final state, and keep INPUT visible long enough
          // for the physical key to render it.
          if (live && status !== "attention") {
            const observedAt = this.attentionObservedAt.get(threadId);
            if (observedAt !== undefined) {
              const remaining = 1000 - (Date.now() - observedAt);
              if (remaining > 0) await delay(remaining);
              this.attentionObservedAt.delete(threadId);
            }
          }

          const eventTime = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : NaN;
          this.states.set(threadId, {
            id: threadId,
            path,
            status,
            updatedAt: Number.isFinite(eventTime) ? eventTime : Date.now()
          });
          if (live && status === "attention") this.attentionObservedAt.set(threadId, Date.now());
          if (live) this.emit();
        } catch {
          // Ignore a malformed record and keep watching subsequent records.
        }
      }
    } finally {
      await file.close();
    }
  }
}

function isSubagentSession(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const session = payload as { thread_source?: unknown; source?: unknown };
  if (session.thread_source === "subagent") return true;
  return (
    typeof session.source === "object" &&
    session.source !== null &&
    "subagent" in session.source
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function collectRecentJournals(root: string, limit: number): Promise<string[]> {
  const found: Array<{ path: string; modified: number }> = [];

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walk(path);
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) return;
        const info = await stat(path);
        found.push({ path, modified: info.mtimeMs });
      })
    );
  }

  await walk(root);
  return found
    .sort((a, b) => b.modified - a.modified)
    .slice(0, limit)
    .map((item) => item.path);
}
