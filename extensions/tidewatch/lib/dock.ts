import { keyText, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Key,
  type KeybindingsManager,
  matchesKey,
  type TUI,
  truncateToWidth,
} from "@earendil-works/pi-tui";

import type { CallLog, TraceCall } from "./calls.ts";
import { detailLines } from "./detail.ts";
import { pluralize } from "./format.ts";
import { callRow, labelWidth, padToWidth } from "./render.ts";

const FRAME_ROWS = 7;
const RESERVED_ROWS = 6;
const MIN_BODY_ROWS = 5;
const MIN_WIDTH = 4;
const MAX_WIDTH = 140;

const PROBLEM_STATUSES = new Set<TraceCall["status"]>(["error", "unfinished"]);

interface DetailCache {
  seq: number;
  revision: number;
  width: number;
  lines: string[];
}

export interface TraceDockOptions {
  log: CallLog;
  tui: TUI;
  theme: Theme;
  keybindings: KeybindingsManager;
  clear: () => void;
  close: () => void;
}

export class TraceDock implements Component {
  readonly #log: CallLog;
  readonly #tui: TUI;
  readonly #theme: Theme;
  readonly #keybindings: KeybindingsManager;
  readonly #clear: () => void;
  readonly #close: () => void;
  readonly #unsubscribe: () => void;

  #detailSeq: number | undefined;
  #detailCache: DetailCache | undefined;
  #selectedSeq: number | undefined;
  #listScroll = 0;
  #detailScroll = 0;
  #problemsOnly = false;

  constructor({ log, tui, theme, keybindings, clear, close }: TraceDockOptions) {
    this.#log = log;
    this.#tui = tui;
    this.#theme = theme;
    this.#keybindings = keybindings;
    this.#clear = clear;
    this.#close = close;
    this.#unsubscribe = log.subscribe(() => tui.requestRender());
  }

  handleInput(data: string): void {
    if (data === "q") {
      this.#close();
      return;
    }
    if (this.#detailSeq === undefined) this.#handleListInput(data);
    else this.#handleDetailInput(data);
    this.#tui.requestRender();
  }

  render(width: number): string[] {
    const frameWidth = Math.min(width, MAX_WIDTH);
    if (frameWidth < MIN_WIDTH) return [];
    const detail = this.#log.calls.find((call) => call.seq === this.#detailSeq);
    if (detail) return this.#renderDetail(detail, frameWidth);
    this.#detailSeq = undefined;
    return this.#renderList(frameWidth);
  }

  invalidate(): void {
    this.#detailCache = undefined;
  }

  dispose(): void {
    this.#unsubscribe();
  }

  get #bodyRows(): number {
    return Math.max(MIN_BODY_ROWS, this.#tui.terminal.rows - FRAME_ROWS - RESERVED_ROWS);
  }

  get #listRows(): number {
    return this.#bodyRows - 1;
  }

  #visibleCalls(): TraceCall[] {
    const calls = this.#log.calls.toReversed();
    return this.#problemsOnly ? calls.filter((call) => PROBLEM_STATUSES.has(call.status)) : calls;
  }

  #handleListInput(data: string): void {
    const calls = this.#visibleCalls();
    const last = Math.max(0, calls.length - 1);
    const selected = this.#selectedIndex(calls);
    const page = this.#listRows;
    const keys = this.#keybindings;
    const select = (index: number) => {
      this.#selectedSeq = calls[Math.min(last, Math.max(0, index))]?.seq;
    };

    if (keys.matches(data, "tui.select.cancel")) this.#close();
    else if (keys.matches(data, "tui.select.up")) select(selected - 1);
    else if (keys.matches(data, "tui.select.down")) select(selected + 1);
    else if (keys.matches(data, "tui.select.pageUp")) select(selected - page);
    else if (keys.matches(data, "tui.select.pageDown")) select(selected + page);
    else if (matchesKey(data, Key.home) || data === "g") select(0);
    else if (matchesKey(data, Key.end) || data === "G") select(last);
    else if (keys.matches(data, "tui.select.confirm") || matchesKey(data, Key.right)) {
      const call = calls[selected];
      if (call) {
        this.#detailSeq = call.seq;
        this.#detailScroll = 0;
      }
    } else if (data === "e") {
      this.#problemsOnly = !this.#problemsOnly;
      this.#resetList();
    } else if (data === "c") {
      this.#clear();
      this.#resetList();
    }
  }

  #handleDetailInput(data: string): void {
    const page = this.#bodyRows;
    const keys = this.#keybindings;

    if (keys.matches(data, "tui.select.cancel") || matchesKey(data, Key.left))
      this.#detailSeq = undefined;
    else if (keys.matches(data, "tui.select.up")) this.#detailScroll -= 1;
    else if (keys.matches(data, "tui.select.down")) this.#detailScroll += 1;
    else if (keys.matches(data, "tui.select.pageUp")) this.#detailScroll -= page;
    else if (keys.matches(data, "tui.select.pageDown")) this.#detailScroll += page;
    else if (matchesKey(data, Key.home) || data === "g") this.#detailScroll = 0;
    else if (matchesKey(data, Key.end) || data === "G")
      this.#detailScroll = Number.MAX_SAFE_INTEGER;
  }

  #selectedIndex(calls: readonly TraceCall[]): number {
    return Math.max(
      0,
      calls.findIndex((call) => call.seq === this.#selectedSeq),
    );
  }

  #resetList(): void {
    this.#selectedSeq = undefined;
    this.#listScroll = 0;
  }

  #frame(title: string, subtitle: string, body: string[], footer: string, width: number): string[] {
    const theme = this.#theme;
    const inner = width - 2;
    const border = (text: string) => theme.fg("borderAccent", text);
    const row = (content = "") =>
      `${border("│")}${padToWidth(truncateToWidth(content, inner), inner)}${border("│")}`;
    return [
      border(`╭${"─".repeat(inner)}╮`),
      row(theme.fg("accent", theme.bold(` ${title}`))),
      row(theme.fg("muted", ` ${subtitle}`)),
      row(),
      ...body.map((line) => row(line)),
      row(),
      row(theme.fg("dim", ` ${footer}`)),
      border(`╰${"─".repeat(inner)}╯`),
    ];
  }

  #renderList(width: number): string[] {
    const theme = this.#theme;
    const rows = this.#listRows;
    const calls = this.#visibleCalls();
    const selectedIndex = this.#selectedIndex(calls);
    if (selectedIndex < this.#listScroll) this.#listScroll = selectedIndex;
    if (selectedIndex >= this.#listScroll + rows) this.#listScroll = selectedIndex - rows + 1;

    const { total, running, errors, unfinished } = this.#log.counts();
    const subtitle = [
      pluralize(total, "call"),
      ...(running > 0 ? [`${running} running`] : []),
      ...(errors > 0 ? [pluralize(errors, "error")] : []),
      ...(unfinished > 0 ? [`${unfinished} unfinished`] : []),
      ...(this.#problemsOnly ? ["problems only"] : []),
      "newest first",
    ].join(" · ");

    const body: string[] = [];
    const visible = calls.slice(this.#listScroll, this.#listScroll + rows);
    if (visible.length === 0) {
      body.push(
        theme.fg(
          "dim",
          this.#problemsOnly ? "  No errors or unfinished calls." : "  No Tidewave calls yet.",
        ),
      );
    } else {
      const columns = labelWidth(visible);
      const innerWidth = width - 2;
      for (const [index, call] of visible.entries()) {
        const selected = this.#listScroll + index === selectedIndex;
        const seq = theme.fg("dim", `#${call.seq}`.padStart(5));
        const line = `${selected ? "›" : " "}${seq} ${callRow(theme, call, columns, innerWidth - 8)}`;
        body.push(selected ? theme.bg("selectedBg", padToWidth(line, innerWidth)) : line);
      }
      if (calls.length > rows) {
        const end = Math.min(calls.length, this.#listScroll + rows);
        body.push(theme.fg("dim", `  ${this.#listScroll + 1}-${end} of ${calls.length}`));
      }
    }

    const footer = [
      `${keyText("tui.select.up")}/${keyText("tui.select.down")} select`,
      `${keyText("tui.select.confirm")} details`,
      "e problems only",
      "c clear",
      `${keyText("tui.select.cancel")} close`,
    ].join(" · ");
    return this.#frame("Tidewave calls", subtitle, body, footer, width);
  }

  #cachedDetailLines(call: TraceCall, width: number): string[] {
    const cache = this.#detailCache;
    if (cache?.seq === call.seq && cache.revision === call.revision && cache.width === width) {
      return cache.lines;
    }
    const lines = detailLines(this.#theme, call, width - 2);
    this.#detailCache = { seq: call.seq, revision: call.revision, width, lines };
    return lines;
  }

  #renderDetail(call: TraceCall, width: number): string[] {
    const rows = this.#bodyRows;
    const lines = this.#cachedDetailLines(call, width);

    const maxScroll = Math.max(0, lines.length - rows);
    this.#detailScroll = Math.min(Math.max(0, this.#detailScroll), maxScroll);
    const end = Math.min(lines.length, this.#detailScroll + rows);
    const position =
      lines.length > rows
        ? `lines ${this.#detailScroll + 1}-${end} of ${lines.length}`
        : pluralize(lines.length, "line");

    const footer = [
      `${keyText("tui.select.up")}/${keyText("tui.select.down")} scroll`,
      "g/G top/bottom",
      `${keyText("tui.select.cancel")} back`,
      "q close",
    ].join(" · ");
    return this.#frame(
      `#${call.seq} ${call.tool}`,
      position,
      lines.slice(this.#detailScroll, end),
      footer,
      width,
    );
  }
}
