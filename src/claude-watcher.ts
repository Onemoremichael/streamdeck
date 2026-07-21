import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { highestPriority, type CodexStatus, type ThreadState } from "./status.js";

export type ClaudeThreadState = ThreadState & {
  cwd?: string;
  transcriptPath?: string;
};

type ClaudeStateFile = {
  version?: number;
  sessionId?: string;
  status?: CodexStatus;
  updatedAt?: number;
  cwd?: string;
  transcriptPath?: string;
};

type Listener = (state: ClaudeThreadState | null) => void;

export class ClaudeStateWatcher {
  readonly root: string;
  readonly states = new Map<string, ClaudeThreadState>();
  readonly modified = new Map<string, number>();
  readonly listeners = new Set<Listener>();
  private watcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(root: string) {
    this.root = root;
  }

  async start(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await this.scan(false);
    this.watcher = watch(this.root, (_event, filename) => {
      if (filename?.endsWith(".json")) void this.scan(true);
    });
    this.pollTimer = setInterval(() => void this.scan(true), 500);
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.current());
    return () => this.listeners.delete(listener);
  }

  async acknowledge(sessionId: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state || (state.status !== "ready" && state.status !== "error")) return;
    const updatedAt = Date.now();
    const next = { ...state, status: "idle" as const, updatedAt };
    this.states.set(sessionId, next);
    await writeFile(
      state.path,
      `${JSON.stringify({
        version: 1,
        sessionId,
        status: "idle",
        updatedAt,
        cwd: state.cwd,
        transcriptPath: state.transcriptPath
      })}\n`,
      "utf8"
    );
    this.emit();
  }

  private current(): ClaudeThreadState | null {
    return highestPriority(this.states.values()) as ClaudeThreadState | null;
  }

  private emit(): void {
    const state = this.current();
    for (const listener of this.listeners) listener(state);
  }

  private async scan(live: boolean): Promise<void> {
    let names: string[];
    try {
      names = (await readdir(this.root)).filter((name) => name.endsWith(".json"));
    } catch {
      return;
    }

    let changed = false;
    await Promise.all(
      names.map(async (name) => {
        const path = join(this.root, name);
        try {
          const info = await stat(path);
          if (this.modified.get(path) === info.mtimeMs) return;
          const record = JSON.parse(await readFile(path, "utf8")) as ClaudeStateFile;
          if (!isClaudeState(record)) return;

          let status = record.status;
          const isStale = Date.now() - record.updatedAt > 6 * 60 * 60 * 1000;
          if (!live && (status === "ready" || status === "error" || isStale)) status = "idle";

          this.modified.set(path, info.mtimeMs);
          this.states.set(record.sessionId, {
            id: record.sessionId,
            path,
            status,
            updatedAt: record.updatedAt,
            cwd: record.cwd,
            transcriptPath: record.transcriptPath
          });
          changed = true;
        } catch {
          // A hook may be replacing the file while it is scanned. The next
          // poll retries without interrupting the Stream Deck plugin.
        }
      })
    );

    if (changed) this.emit();
  }
}

function isClaudeState(record: ClaudeStateFile): record is Required<
  Pick<ClaudeStateFile, "sessionId" | "status" | "updatedAt">
> &
  ClaudeStateFile {
  return (
    typeof record.sessionId === "string" &&
    typeof record.updatedAt === "number" &&
    ["idle", "working", "ready", "attention", "error"].includes(record.status ?? "")
  );
}
