import type { Theme } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

import type { TraceCall } from "./calls.ts";
import { formatArgs, formatDuration } from "./format.ts";
import { displayLine, statusLabel } from "./render.ts";

const INDENT = "   ";

type BodyColor = "toolOutput" | "error" | "dim";

export function detailLines(theme: Theme, call: TraceCall, innerWidth: number): string[] {
  const textWidth = Math.max(1, innerWidth - INDENT.length - 1);
  const label = (name: string) => theme.fg("toolTitle", name);
  const block = (text: string, color: BodyColor) =>
    text
      .split("\n")
      .map((line) => displayLine(line))
      .flatMap((line) => (line.length > 0 ? wrapTextWithAnsi(line, textWidth) : [""]))
      .map((line) => `${INDENT}${theme.fg(color, line)}`);

  const caller = call.parentId
    ? `codemode script ${theme.fg("dim", call.parentId)}`
    : "model (direct)";
  const result =
    call.result === undefined
      ? block(call.status === "running" ? "(still running)" : "(not kept in the session)", "dim")
      : block(call.result || "(empty)", call.status === "error" ? "error" : "toolOutput");

  return [
    ` ${label("Server:")} ${call.server}`,
    ` ${label("Status:")} ${statusLabel(theme, call.status)} ${theme.fg("dim", `· ${formatDuration(call.durationMs, call.status === "running")}`)}`,
    ` ${label("Started:")} ${call.startedBefore ? "before " : ""}${new Date(call.startedAt).toLocaleTimeString()}`,
    ` ${label("Called by:")} ${caller}`,
    "",
    ` ${label("Arguments:")}`,
    ...block(formatArgs(call.args), "toolOutput"),
    "",
    ` ${label("Result:")}`,
    ...result,
  ];
}
