import { formatResult, isErrorResult, summarizeArgs } from "./format.ts";

const TOOL_NAME = /^mcp__(tidewave\w*?)__(.+)$/iu;
const DEFAULT_LIMIT = 500;

export type CallStatus = "running" | "ok" | "error" | "unfinished";

export interface TraceCall {
  id: string;
  seq: number;
  server: string;
  tool: string;
  args: unknown;
  summary: string;
  parentId?: string;
  startedAt: number;
  durationMs?: number;
  status: CallStatus;
  result?: string;
}

export interface CallStart {
  id: string;
  toolName: string;
  args: unknown;
  parentId?: string;
  startedAt?: number;
}

export interface CallEnd {
  result: unknown;
  isError: boolean;
  durationMs?: number;
}

export interface RecordedCall extends CallStart {
  status: Exclude<CallStatus, "running">;
  durationMs?: number;
  result?: string;
}

export interface CallCounts {
  total: number;
  running: number;
  errors: number;
}

export function parseToolName(toolName: string): { server: string; tool: string } | undefined {
  const match = TOOL_NAME.exec(toolName);
  return match ? { server: match[1], tool: match[2] } : undefined;
}

export class CallLog {
  #calls: TraceCall[] = [];
  #seq = 0;
  #listeners = new Set<() => void>();
  readonly #limit: number;

  constructor(limit = DEFAULT_LIMIT) {
    this.#limit = limit;
  }

  get calls(): readonly TraceCall[] {
    return this.#calls;
  }

  get latest(): TraceCall | undefined {
    return this.#calls.at(-1);
  }

  counts(): CallCounts {
    let running = 0;
    let errors = 0;
    for (const call of this.#calls) {
      if (call.status === "running") running += 1;
      else if (call.status === "error") errors += 1;
    }
    return { total: this.#calls.length, running, errors };
  }

  get(id: string): TraceCall | undefined {
    return this.#calls.findLast((call) => call.id === id);
  }

  start(start: CallStart): TraceCall | undefined {
    const call = this.#create(start);
    if (!call) return undefined;
    this.#push(call);
    this.#emit();
    return call;
  }

  finish(id: string, end: CallEnd): TraceCall | undefined {
    const call = this.get(id);
    if (!call) return undefined;
    call.durationMs = end.durationMs ?? Date.now() - call.startedAt;
    call.status = end.isError || isErrorResult(end.result) ? "error" : "ok";
    call.result = formatResult(end.result);
    this.#emit();
    return call;
  }

  replace(records: readonly RecordedCall[]): void {
    this.#calls = [];
    this.#seq = 0;
    for (const record of records) {
      const call = this.#create(record);
      if (!call) continue;
      call.status = record.status;
      call.durationMs = record.durationMs;
      call.result = record.result;
      this.#push(call);
    }
    this.#emit();
  }

  clear(): void {
    this.#calls = [];
    this.#emit();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #create(start: CallStart): TraceCall | undefined {
    const name = parseToolName(start.toolName);
    if (!name) return undefined;
    this.#seq += 1;
    return {
      id: start.id,
      seq: this.#seq,
      server: name.server,
      tool: name.tool,
      args: start.args,
      summary: summarizeArgs(start.args),
      parentId: start.parentId,
      startedAt: start.startedAt ?? Date.now(),
      status: "running",
    };
  }

  #push(call: TraceCall): void {
    this.#calls.push(call);
    if (this.#calls.length > this.#limit) this.#calls.splice(0, this.#calls.length - this.#limit);
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
