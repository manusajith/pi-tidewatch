import type { Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import type { CallStatus, TraceCall } from "./calls.ts";
import { formatDuration } from "./format.ts";

export function displayLine(line: string): string {
  return stripTerminalSequences(line)
    .replaceAll("\t", "   ")
    .replaceAll(/\p{Cc}/gu, "");
}

export function statusIcon(theme: Theme, status: CallStatus): string {
  if (status === "running") return theme.fg("warning", "…");
  return status === "ok" ? theme.fg("success", "✓") : theme.fg("error", "✗");
}

export function callLabel(call: TraceCall): string {
  return call.parentId ? `${call.tool} (script)` : call.tool;
}

export function labelWidth(calls: readonly TraceCall[]): number {
  return Math.max(0, ...calls.map((call) => callLabel(call).length));
}

export function padToWidth(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

export function callRow(
  theme: Theme,
  call: TraceCall,
  labelColumns: number,
  width: number,
): string {
  const label = theme.fg("accent", callLabel(call).padEnd(labelColumns));
  const duration = theme.fg("dim", formatDuration(call.durationMs).padStart(6));
  const prefix = `${statusIcon(theme, call.status)} ${label} ${duration}  `;
  const room = Math.max(0, width - visibleWidth(prefix));
  return truncateToWidth(
    prefix + theme.fg("muted", truncateToWidth(displayLine(call.summary), room)),
    width,
  );
}
