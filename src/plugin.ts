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
import { CodexJournalWatcher } from "./watcher.js";
import type { CodexStatus, ThreadState } from "./status.js";

const CODEX_ACTION_UUID = "com.onemoremichael.codex-attention.priority";
const CLAUDE_ACTION_UUID = "com.onemoremichael.codex-attention.claude-priority";
const journalWatcher = new CodexJournalWatcher(join(homedir(), ".codex", "sessions"));
const claudeWatcher = new ClaudeStateWatcher(join(homedir(), ".claude", "stream-deck", "state"));
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

@action({ UUID: CODEX_ACTION_UUID })
class CodexPriorityAction extends SingletonAction {
  private state: ThreadState | null = null;
  private visible = new Map<string, WillAppearEvent["action"]>();
  private pulseBright = true;
  private timer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.unsubscribe = journalWatcher.subscribe((state) => {
      this.state = state;
      void this.renderAll();
    });
    this.timer = setInterval(() => {
      this.pulseBright = !this.pulseBright;
      if (this.state?.status !== "idle") void this.renderAll();
    }, 650);
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.visible.set(ev.action.id, ev.action);
    await this.render(ev.action);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.visible.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const threadId = this.state?.id;
    const target = threadId ? `codex://threads/${threadId}` : "/Applications/ChatGPT.app";

    execFile("/usr/bin/open", [target], (error) => {
      if (error) void ev.action.showAlert();
      else void ev.action.showOk();
    });

    if (threadId) journalWatcher.acknowledge(threadId);
  }

  private async renderAll(): Promise<void> {
    await Promise.all([...this.visible.values()].map((item) => this.render(item)));
  }

  private async render(target: WillAppearEvent["action"]): Promise<void> {
    const status = this.state?.status ?? "idle";
    await target.setImage(makeKeySvg(status, this.pulseBright, CODEX_ICON));
    await target.setTitle("");
  }
}

@action({ UUID: CLAUDE_ACTION_UUID })
class ClaudePriorityAction extends SingletonAction {
  private state: ClaudeThreadState | null = null;
  private visible = new Map<string, WillAppearEvent["action"]>();
  private pulseBright = true;
  private timer: NodeJS.Timeout;

  constructor() {
    super();
    claudeWatcher.subscribe((state) => {
      this.state = state;
      void this.renderAll();
    });
    this.timer = setInterval(() => {
      this.pulseBright = !this.pulseBright;
      if (this.state?.status !== "idle") void this.renderAll();
    }, 650);
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.visible.set(ev.action.id, ev.action);
    await this.render(ev.action);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    this.visible.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    execFile("/usr/bin/open", ["-a", "Claude"], (error) => {
      if (error) void ev.action.showAlert();
      else void ev.action.showOk();
    });

    if (this.state) await claudeWatcher.acknowledge(this.state.id);
  }

  private async renderAll(): Promise<void> {
    await Promise.all([...this.visible.values()].map((item) => this.render(item)));
  }

  private async render(target: WillAppearEvent["action"]): Promise<void> {
    const status = this.state?.status ?? "idle";
    await target.setImage(makeKeySvg(status, this.pulseBright, CLAUDE_ICON));
    await target.setTitle("");
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

streamDeck.actions.registerAction(new CodexPriorityAction());
streamDeck.actions.registerAction(new ClaudePriorityAction());

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
