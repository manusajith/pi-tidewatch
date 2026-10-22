import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

import type { CallLog } from "./calls.ts";
import { callRow, labelWidth } from "./render.ts";

const WIDGET_ROWS = 5;

export class CallWidget implements Component {
  readonly #log: CallLog;
  readonly #theme: Theme;
  readonly #unsubscribe: () => void;

  constructor(log: CallLog, tui: TUI, theme: Theme) {
    this.#log = log;
    this.#theme = theme;
    this.#unsubscribe = log.subscribe(() => tui.requestRender());
  }

  render(width: number): string[] {
    const calls = this.#log.calls.slice(-WIDGET_ROWS);
    const columns = labelWidth(calls);
    return calls.map((call) => callRow(this.#theme, call, columns, width));
  }

  invalidate(): void {}

  dispose(): void {
    this.#unsubscribe();
  }
}
