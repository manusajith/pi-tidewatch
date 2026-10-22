import assert from "node:assert/strict";
import test from "node:test";

import type { Theme } from "@earendil-works/pi-coding-agent";
import { type KeybindingsManager, type TUI, visibleWidth } from "@earendil-works/pi-tui";

import { CallLog, type RecordedCall } from "../extensions/tidewatch/lib/calls.ts";
import { TraceDock } from "../extensions/tidewatch/lib/dock.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function createDock(log: CallLog, rows = 40): TraceDock {
  const tui = { terminal: { rows }, requestRender: () => {} } as unknown as TUI;
  const keybindings = {
    matches: (data: string, binding: string) => data === binding,
  } as unknown as KeybindingsManager;
  return new TraceDock({ log, tui, theme, keybindings, clear: () => log.clear(), close: () => {} });
}

function seed(log: CallLog, count: number): void {
  for (let index = 1; index <= count; index += 1) {
    log.start({
      id: `call-${index}`,
      toolName: "mcp__tidewave__project_eval",
      args: { code: `${index}` },
    });
  }
}

test("the dock never renders lines wider than the terminal", () => {
  const log = new CallLog();
  seed(log, 3);
  const dock = createDock(log);
  const widths = [3, 4, 10, 19, 80, 200];
  for (const width of widths) {
    for (const line of dock.render(width)) {
      assert.ok(visibleWidth(line) <= width, `line wider than ${width}: ${line}`);
    }
  }
  dock.handleInput("tui.select.confirm");
  for (const width of widths) {
    for (const line of dock.render(width)) {
      assert.ok(visibleWidth(line) <= width, `detail line wider than ${width}: ${line}`);
    }
  }
});

test("the detail view wraps long arguments on narrow terminals", () => {
  const log = new CallLog();
  log.start({ id: "a", toolName: "mcp__tidewave__project_eval", args: { code: "z".repeat(40) } });
  const dock = createDock(log);
  dock.handleInput("tui.select.confirm");
  for (const width of [8, 10, 19]) {
    const shown = dock.render(width).join("").replaceAll(/[^z]/gu, "");
    assert.equal(shown.length, 40, `width ${width}`);
  }
});

test("page down moves by the number of rows the list shows", () => {
  const log = new CallLog();
  seed(log, 20);
  const dock = createDock(log, 20);
  dock.handleInput("tui.select.pageDown");
  const lines = dock.render(80);
  const selected = lines.find((line) => line.includes("›"));
  assert.ok(selected?.includes("#14"), selected);
});

test("the detail view reflects a result that arrives while it is open", () => {
  const log = new CallLog();
  seed(log, 1);
  const dock = createDock(log);
  dock.handleInput("tui.select.confirm");
  assert.ok(dock.render(80).some((line) => line.includes("(still running)")));
  log.finish("call-1", { result: "42", isError: false, durationMs: 5 });
  assert.ok(dock.render(80).some((line) => line.includes("42")));
});

test("the problems filter shows errors and unfinished script calls", () => {
  const log = new CallLog();
  log.replace([
    { id: "a", toolName: "mcp__tidewave__get_docs", args: { code: "fine" }, status: "ok" },
    { id: "b", toolName: "mcp__tidewave__get_logs", args: { code: "broken" }, status: "error" },
    { id: "c", toolName: "mcp__tidewave__get_docs", args: { code: "cut" }, status: "unfinished" },
  ]);
  const dock = createDock(log);
  dock.handleInput("e");
  const text = dock.render(80).join("\n");
  assert.ok(text.includes("1 error · 1 unfinished · problems only"), text);
  assert.ok(text.includes("broken") && text.includes("cut"), text);
  assert.ok(!text.includes("fine"), text);
});

test("the selection stays on the same call when new calls arrive", () => {
  const log = new CallLog();
  seed(log, 5);
  const dock = createDock(log);
  dock.handleInput("tui.select.down");
  dock.handleInput("tui.select.down");
  log.start({ id: "call-6", toolName: "mcp__tidewave__project_eval", args: { code: "6" } });
  const selected = dock.render(80).find((line) => line.includes("›"));
  assert.ok(selected?.includes("#3"), selected);
  dock.handleInput("G");
  assert.ok(
    dock
      .render(80)
      .find((line) => line.includes("›"))
      ?.includes("#1"),
  );
});

function restoredCall(durationMs: number): RecordedCall {
  return {
    id: "a",
    toolName: "mcp__tidewave__project_eval",
    args: { code: "1" },
    status: "ok",
    durationMs,
    result: "2",
  };
}

test("the detail view redraws when a restored call replaces the one on screen", () => {
  const log = new CallLog();
  log.replace([restoredCall(40)]);
  const dock = createDock(log);
  dock.handleInput("tui.select.confirm");
  assert.ok(dock.render(80).some((line) => line.includes("40ms")));
  log.replace([restoredCall(75)]);
  assert.ok(dock.render(80).some((line) => line.includes("75ms")));
});
