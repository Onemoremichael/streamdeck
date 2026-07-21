export const STATUS_PRIORITY = {
  idle: 0,
  working: 1,
  ready: 2,
  attention: 3,
  error: 4
} as const;

export type CodexStatus = keyof typeof STATUS_PRIORITY;

export type ThreadState = {
  id: string;
  path: string;
  status: CodexStatus;
  updatedAt: number;
};

type JournalRecord = {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    name?: string;
    status?: string;
    input?: unknown;
  };
};

export function statusFromRecord(record: JournalRecord): CodexStatus | null {
  const outer = record.type ?? "";
  const type = record.payload?.type ?? "";
  const name = record.payload?.name ?? "";
  const status = record.payload?.status ?? "";
  const input = record.payload?.input;

  if (
    type === "exec_approval_request" ||
    type === "apply_patch_approval_request" ||
    type === "elicitation_request" ||
    name === "request_user_input" ||
    name.endsWith("request_user_input") ||
    isPermissionRequestCall(type, name, input)
  ) {
    return "attention";
  }

  if (
    type === "turn_aborted" ||
    type === "error" ||
    (outer === "event_msg" && (status === "failed" || status === "error"))
  ) {
    return "error";
  }

  if (outer === "event_msg" && type === "task_started") return "working";
  if (outer === "event_msg" && type === "task_complete") return "ready";
  if (type === "custom_tool_call_output" || type === "function_call_output") return "working";

  return null;
}

function isPermissionRequestCall(type: string, name: string, input: unknown): boolean {
  if (type !== "custom_tool_call" || name !== "exec") return false;

  const serialized = typeof input === "string" ? input : JSON.stringify(input ?? {});
  return (
    /\btools\.request_permissions\s*\(/.test(serialized) ||
    /["']?sandbox_permissions["']?\s*:\s*["']require_escalated["']/.test(serialized)
  );
}

export function highestPriority(states: Iterable<ThreadState>): ThreadState | null {
  let winner: ThreadState | null = null;

  for (const state of states) {
    if (
      winner === null ||
      STATUS_PRIORITY[state.status] > STATUS_PRIORITY[winner.status] ||
      (STATUS_PRIORITY[state.status] === STATUS_PRIORITY[winner.status] &&
        state.updatedAt > winner.updatedAt)
    ) {
      winner = state;
    }
  }

  return winner;
}

export function threadIdFromPath(path: string): string | null {
  return path.match(/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$/i)?.[1] ?? null;
}
