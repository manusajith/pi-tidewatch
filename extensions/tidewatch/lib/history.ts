import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { parseToolName, type RecordedCall } from "./calls.ts";
import { formatResult } from "./format.ts";

export const CLEAR_ENTRY = "tidewatch-clear";

const UNFINISHED_NOTE = "Still running when the codemode script finished.";

function startedAt(finishedAt: number, durationMs: number | undefined): number {
  return durationMs === undefined ? finishedAt : finishedAt - durationMs;
}

interface IssuedCall {
  args: unknown;
  issuedAt: number;
}

export function lastClearedAt(entries: readonly SessionEntry[]): number {
  let clearedAt = Number.NEGATIVE_INFINITY;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== CLEAR_ENTRY) continue;
    const at = Date.parse(entry.timestamp);
    if (at > clearedAt) clearedAt = at;
  }
  return clearedAt;
}

export function callsFromBranch(
  entries: readonly SessionEntry[],
  clearedAt = Number.NEGATIVE_INFINITY,
): RecordedCall[] {
  const issued = new Map<string, IssuedCall>();
  const records: RecordedCall[] = [];

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;

    if (message.role === "assistant") {
      for (const part of message.content) {
        if (part.type === "toolCall") {
          issued.set(part.id, { args: part.arguments, issuedAt: Date.parse(entry.timestamp) });
        }
      }
      continue;
    }
    if (message.role !== "toolResult") continue;
    const call = issued.get(message.toolCallId);
    if ((call?.issuedAt ?? Date.parse(entry.timestamp)) <= clearedAt) continue;

    for (const nested of message.nestedCalls?.calls ?? []) {
      if (!parseToolName(nested.name)) continue;
      records.push({
        id: nested.id,
        toolName: nested.name,
        args: nested.arguments ?? { omitted: `${nested.argumentsBytes ?? "?"} bytes` },
        parentId: message.toolCallId,
        startedAt: startedAt(message.timestamp, nested.durationMs),
        startedBefore: true,
        durationMs: nested.durationMs,
        status: nested.status,
        result: nested.status === "unfinished" ? UNFINISHED_NOTE : nested.error,
      });
    }

    if (parseToolName(message.toolName)) {
      records.push({
        id: message.toolCallId,
        toolName: message.toolName,
        args: call?.args,
        startedAt: startedAt(message.timestamp, message.durationMs),
        durationMs: message.durationMs,
        status: message.isError ? "error" : "ok",
        result: formatResult(message),
      });
    }
  }

  return records;
}
