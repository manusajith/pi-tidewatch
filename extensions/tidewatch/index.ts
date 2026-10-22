import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

import { CallLog } from "./lib/calls.ts";
import { TraceDock } from "./lib/dock.ts";
import { formatDuration } from "./lib/format.ts";
import { callsFromBranch } from "./lib/history.ts";
import { statusColor, statusSymbol } from "./lib/render.ts";
import { CallWidget } from "./lib/widget.ts";

const KEY = "tidewatch";
const SHORTCUT = "shift+up";
const USAGE = "Usage: /tidewatch [clear | widget [on|off]]";

const SUBCOMMANDS: AutocompleteItem[] = [
  { value: "clear", label: "clear", description: "Forget the calls traced so far" },
  { value: "widget", label: "widget", description: "Toggle the live rows above the editor" },
  { value: "widget on", label: "widget on", description: "Show the live rows above the editor" },
  { value: "widget off", label: "widget off", description: "Hide the live rows above the editor" },
];

function statusText(theme: Theme, log: CallLog, dockOpen: boolean): string | undefined {
  const latest = log.latest;
  if (!latest) return undefined;
  const { total, errors } = log.counts();
  const outcome =
    latest.status === "running"
      ? statusSymbol(latest.status)
      : `${formatDuration(latest.durationMs)} ${statusSymbol(latest.status)}`;
  return (
    theme.fg("accent", `tidewave ${total}`) +
    (errors > 0 ? theme.fg(statusColor("error"), ` ${statusSymbol("error")}${errors}`) : "") +
    theme.fg("muted", ` · ${latest.tool} ${outcome}`) +
    (dockOpen ? "" : theme.fg("dim", ` · ${SHORTCUT}`))
  );
}

export default function tidewatch(pi: ExtensionAPI): void {
  const log = new CallLog();
  let widgetMounted = false;
  let dockOpen = false;
  let widgetEnabled = true;

  function refresh(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(KEY, statusText(ctx.ui.theme, log, dockOpen));

    const showWidget = widgetEnabled && !dockOpen && ctx.mode === "tui" && log.calls.length > 0;
    if (showWidget === widgetMounted) return;
    widgetMounted = showWidget;
    ctx.ui.setWidget(KEY, showWidget ? (tui, theme) => new CallWidget(log, tui, theme) : undefined);
  }

  function clearTrace(ctx: ExtensionContext): void {
    log.clear();
    refresh(ctx);
  }

  async function openDock(ctx: ExtensionContext): Promise<void> {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("The Tidewave call dock needs the interactive terminal UI.", "warning");
      return;
    }
    if (dockOpen) return;
    dockOpen = true;
    refresh(ctx);
    try {
      await ctx.ui.custom<void>(
        (tui, theme, keybindings, done) =>
          new TraceDock({
            log,
            tui,
            theme,
            keybindings,
            clear: () => clearTrace(ctx),
            close: () => done(),
          }),
      );
    } finally {
      dockOpen = false;
      refresh(ctx);
    }
  }

  function restore(ctx: ExtensionContext): void {
    log.replace(callsFromBranch(ctx.sessionManager.getBranch()));
    refresh(ctx);
  }

  pi.on("session_start", (_event, ctx) => {
    widgetMounted = false;
    restore(ctx);
  });

  pi.on("session_tree", (_event, ctx) => restore(ctx));

  pi.on("tool_execution_start", (event, ctx) => {
    const call = log.start({
      id: event.toolCallId,
      toolName: event.toolName,
      args: event.args,
      parentId: event.parentToolCallId,
    });
    if (call) refresh(ctx);
  });

  pi.on("tool_execution_end", (event, ctx) => {
    const call = log.finish(event.toolCallId, {
      result: event.result,
      isError: event.isError,
      durationMs: event.durationMs,
    });
    if (call) refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(KEY, undefined);
    ctx.ui.setWidget(KEY, undefined);
    widgetMounted = false;
  });

  pi.registerShortcut(SHORTCUT, {
    description: "Open the Tidewave call dock",
    handler: (ctx) => openDock(ctx),
  });

  pi.registerCommand("tidewatch", {
    description: "Browse Tidewave calls, or clear them and toggle the live rows",
    getArgumentCompletions: (prefix) => {
      const matches = SUBCOMMANDS.filter((item) => item.value.startsWith(prefix.trimStart()));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args, ctx) => {
      const [action = "", value = ""] = args.trim().split(/\s+/u);
      if (action === "") {
        await openDock(ctx);
      } else if (action === "clear") {
        clearTrace(ctx);
      } else if (action === "widget" && ["", "on", "off"].includes(value)) {
        widgetEnabled = value === "" ? !widgetEnabled : value === "on";
        refresh(ctx);
        ctx.ui.notify(`Tidewave live rows ${widgetEnabled ? "shown" : "hidden"}`, "info");
      } else {
        ctx.ui.notify(USAGE, "warning");
      }
    },
  });
}
