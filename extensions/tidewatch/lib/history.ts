import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { parseToolName, type RecordedCall } from "./calls.ts";
import { formatResult } from "./format.ts";

const UNFINISHED_NOTE = "Still running when the codemode script finished.";

function startedAt(finishedAt: number, durationMs: number | undefined): number {
  return durationMs === undefined ? finishedAt : finishedAt - durationMs;
}

export function callsFromBranch(entries: readonly SessionEntry[]): RecordedCall[] {
  const argsById = new Map<string, unknown>();
  const records: RecordedCall[] = [];

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;

    if (message.role === "assistant") {
      for (const part of message.content) {
        if (part.type === "toolCall") argsById.set(part.id, part.arguments);
      }
      continue;
    }
    if (message.role !== "toolResult") continue;

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
        args: argsById.get(message.toolCallId),
        startedAt: startedAt(message.timestamp, message.durationMs),
        durationMs: message.durationMs,
        status: message.isError ? "error" : "ok",
        result: formatResult(message),
      });
    }
  }

  return records;
}
