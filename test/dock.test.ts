import assert from "node:assert/strict";
import test from "node:test";

import type { Theme } from "@earendil-works/pi-coding-agent";
import { type KeybindingsManager, type TUI, visibleWidth } from "@earendil-works/pi-tui";

import { CallLog } from "../extensions/tidewatch/lib/calls.ts";
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
  for (const width of [3, 4, 10, 19, 80, 200]) {
    for (const line of dock.render(width)) {
      assert.ok(visibleWidth(line) <= width, `line wider than ${width}: ${line}`);
    }
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
