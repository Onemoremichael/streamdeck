import streamDeck, {
  action,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
  SingletonAction
} from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ClaudeStateWatcher, type ClaudeThreadState } from "./claude-watcher.js";
import { StableLaneBoard } from "./lanes.js";
import type { CodexStatus, ThreadState } from "./status.js";
import { CodexJournalWatcher } from "./watcher.js";

const journalWatcher = new CodexJournalWatcher(join(homedir(), ".codex", "sessions"));
const claudeWatcher = new ClaudeStateWatcher(join(homedir(), ".claude", "stream-deck", "state"));
const codexLanes = new StableLaneBoard<ThreadState>();
const claudeLanes = new StableLaneBoard<ClaudeThreadState>();
const CODEX_ICON = readFileSync(new URL("../imgs/action-icon.png", import.meta.url)).toString("base64");
const CLAUDE_ICON = readFileSync(new URL("../imgs/claude-action-icon.png", import.meta.url)).toString(
  "base64"
);

const COLORS: Record<CodexStatus, { glow: string; label: string }> = {
  idle: { glow: "#E7E7E7", label: "IDLE" },
  working: { glow: "#3B82F6", label: "WORKING" },
  ready: { glow: "#36C275", label: "READY" },
  attention: { glow: "#F5A623", label: "INPUT" },
  error: { glow: "#EF4444", label: "ERROR" }
};

type AssignmentSettings = {
  lastTaskId?: string;
};

abstract class AgentSlotAction<T extends ThreadState> extends SingletonAction {
  private readonly visible = new Map<string, WillAppearEvent["action"]>();
  private readonly persistedAssignments = new Map<string, string | undefined>();
  private pulseBright = true;
  private readonly timer: NodeJS.Timeout;

  protected constructor(
    private readonly board: StableLaneBoard<T>,
    private readonly icon: string
  ) {
    super();
    board.subscribe(() => void this.renderAll());
    this.timer = setInterval(() => {
      this.pulseBright = !this.pulseBright;
      if ([...this.visible.keys()].some((slotId) => this.board.get(slotId))) void this.renderAll();
    }, 650);
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const settings = await ev.action
      .getSettings<AssignmentSettings>()
      .catch((): AssignmentSettings => ({}));
    this.visible.set(ev.action.id, ev.action);
    this.persistedAssignments.set(ev.action.id, settings.lastTaskId);
    this.board.addSlot(
      ev.action.id,
      settings.lastTaskId
        ? ({ id: settings.lastTaskId, path: "", status: "idle", updatedAt: 0 } as T)
        : undefined
    );
    await this.render(ev.action);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.visible.delete(ev.action.id);
    this.persistedAssignments.delete(ev.action.id);
    this.board.removeSlot(ev.action.id);
  }

  protected stateFor(ev: KeyDownEvent): T | null {
    return this.board.get(ev.action.id);
  }

  protected open(target: string[], ev: KeyDownEvent): void {
    execFile("/usr/bin/open", target, (error) => {
      if (error) void ev.action.showAlert();
      else void ev.action.showOk();
    });
  }

  private async renderAll(): Promise<void> {
    await Promise.all([...this.visible.values()].map((item) => this.render(item)));
  }

  private async render(target: WillAppearEvent["action"]): Promise<void> {
    const state = this.board.get(target.id);
    const status = state?.status ?? "idle";
    const persisted = this.persistedAssignments.get(target.id);
    if (state?.id !== persisted) {
      this.persistedAssignments.set(target.id, state?.id);
      await target.setSettings<AssignmentSettings>(state ? { lastTaskId: state.id } : {});
    }
    await target.setImage(makeKeySvg(status, this.pulseBright, this.icon));
    await target.setTitle("");
  }
}

abstract class CodexSlotAction extends AgentSlotAction<ThreadState> {
  protected constructor() {
    super(codexLanes, CODEX_ICON);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const threadId = this.stateFor(ev)?.id;
    this.open([threadId ? `codex://threads/${threadId}` : "/Applications/ChatGPT.app"], ev);
    if (threadId) journalWatcher.acknowledge(threadId);
  }
}

abstract class ClaudeSlotAction extends AgentSlotAction<ClaudeThreadState> {
  protected constructor() {
    super(claudeLanes, CLAUDE_ICON);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const state = this.stateFor(ev);
    this.open(["-a", "Claude"], ev);
    if (state) await claudeWatcher.acknowledge(state.id);
  }
}

@action({ UUID: "com.onemoremichael.codex-attention.priority" })
class CodexTaskAction extends CodexSlotAction {
  constructor() {
    super();
  }
}

@action({ UUID: "com.onemoremichael.codex-attention.claude-priority" })
class ClaudeTaskAction extends ClaudeSlotAction {
  constructor() {
    super();
  }
}

function makeKeySvg(status: CodexStatus, bright: boolean, icon: string): string {
  const { glow, label } = COLORS[status];
  const opacity = status === "idle" ? 0.22 : bright ? 0.95 : 0.42;
  const ring = status === "idle" ? "#777777" : glow;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <defs>
      <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="10" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="144" height="144" rx="22" fill="#0B0B0C"/>
    <circle cx="72" cy="61" r="38" fill="${glow}" opacity="${opacity}" filter="url(#g)"/>
    <circle cx="72" cy="61" r="38" fill="#111214" stroke="${ring}" stroke-width="4"/>
    <image href="data:image/png;base64,${icon}" x="37" y="26" width="70" height="70"/>
    <text x="72" y="124" text-anchor="middle" fill="#F7F7F7" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="700">${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

streamDeck.actions.registerAction(new CodexTaskAction());
streamDeck.actions.registerAction(new ClaudeTaskAction());

journalWatcher.subscribe(() => codexLanes.update(journalWatcher.states.values()));
claudeWatcher.subscribe(() => claudeLanes.update(claudeWatcher.states.values()));

// Stream Deck expects plugins to connect promptly. Start the journal scan in
// the background so a large Codex history cannot trigger its startup timeout.
void streamDeck.connect().catch((error) => {
  streamDeck.logger.error(`Stream Deck connection failed: ${String(error)}`);
});
void journalWatcher.start().catch((error) => {
  streamDeck.logger.error(`Codex watcher failed: ${String(error)}`);
});
void claudeWatcher.start().catch((error) => {
  streamDeck.logger.error(`Claude watcher failed: ${String(error)}`);
});
