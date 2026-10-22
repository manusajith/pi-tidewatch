import { keyText, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Key,
  type KeybindingsManager,
  matchesKey,
  type TUI,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import type { CallLog, TraceCall } from "./calls.ts";
import { formatArgs, formatDuration, pluralize } from "./format.ts";
import { callRow, displayLine, labelWidth, padToWidth } from "./render.ts";

const FRAME_ROWS = 7;
const RESERVED_ROWS = 6;
const MIN_BODY_ROWS = 5;
const MIN_WIDTH = 4;
const MAX_WIDTH = 140;

type BodyColor = "toolOutput" | "error" | "dim";

export interface TraceDockOptions {
  log: CallLog;
  tui: TUI;
  theme: Theme;
  keybindings: KeybindingsManager;
  close: () => void;
}

export class TraceDock implements Component {
  readonly #log: CallLog;
  readonly #tui: TUI;
  readonly #theme: Theme;
  readonly #keybindings: KeybindingsManager;
  readonly #close: () => void;
  readonly #unsubscribe: () => void;

  #detailSeq: number | undefined;
  #selected = 0;
  #listScroll = 0;
  #detailScroll = 0;
  #errorsOnly = false;

  constructor({ log, tui, theme, keybindings, close }: TraceDockOptions) {
    this.#log = log;
    this.#tui = tui;
    this.#theme = theme;
    this.#keybindings = keybindings;
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

  invalidate(): void {}

  dispose(): void {
    this.#unsubscribe();
  }

  get #bodyRows(): number {
    return Math.max(MIN_BODY_ROWS, this.#tui.terminal.rows - FRAME_ROWS - RESERVED_ROWS);
  }

  #visibleCalls(): TraceCall[] {
    const calls = this.#log.calls.toReversed();
    return this.#errorsOnly ? calls.filter((call) => call.status === "error") : calls;
  }

  #handleListInput(data: string): void {
    const calls = this.#visibleCalls();
    const last = Math.max(0, calls.length - 1);
    const page = this.#bodyRows;
    const keys = this.#keybindings;

    if (keys.matches(data, "tui.select.cancel")) this.#close();
    else if (keys.matches(data, "tui.select.up")) this.#selected = Math.max(0, this.#selected - 1);
    else if (keys.matches(data, "tui.select.down"))
      this.#selected = Math.min(last, this.#selected + 1);
    else if (keys.matches(data, "tui.select.pageUp"))
      this.#selected = Math.max(0, this.#selected - page);
    else if (keys.matches(data, "tui.select.pageDown"))
      this.#selected = Math.min(last, this.#selected + page);
    else if (matchesKey(data, Key.home) || data === "g") this.#selected = 0;
    else if (matchesKey(data, Key.end) || data === "G") this.#selected = last;
    else if (keys.matches(data, "tui.select.confirm") || matchesKey(data, Key.right)) {
      const call = calls[this.#selected];
      if (call) {
        this.#detailSeq = call.seq;
        this.#detailScroll = 0;
      }
    } else if (data === "e") {
      this.#errorsOnly = !this.#errorsOnly;
      this.#resetList();
    } else if (data === "c") {
      this.#log.clear();
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

  #resetList(): void {
    this.#selected = 0;
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
    const rows = this.#bodyRows - 1;
    const calls = this.#visibleCalls();
    this.#selected = Math.min(this.#selected, Math.max(0, calls.length - 1));
    if (this.#selected < this.#listScroll) this.#listScroll = this.#selected;
    if (this.#selected >= this.#listScroll + rows) this.#listScroll = this.#selected - rows + 1;

    const { total, running, errors } = this.#log.counts();
    const subtitle = [
      pluralize(total, "call"),
      ...(running > 0 ? [`${running} running`] : []),
      ...(errors > 0 ? [pluralize(errors, "error")] : []),
      ...(this.#errorsOnly ? ["errors only"] : []),
      "newest first",
    ].join(" · ");

    const body: string[] = [];
    const visible = calls.slice(this.#listScroll, this.#listScroll + rows);
    if (visible.length === 0) {
      body.push(theme.fg("dim", this.#errorsOnly ? "  No errors." : "  No Tidewave calls yet."));
    } else {
      const columns = labelWidth(visible);
      const innerWidth = width - 2;
      for (const [index, call] of visible.entries()) {
        const selected = this.#listScroll + index === this.#selected;
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
      "e errors only",
      "c clear",
      `${keyText("tui.select.cancel")} close`,
    ].join(" · ");
    return this.#frame("Tidewave calls", subtitle, body, footer, width);
  }

  #detailLines(call: TraceCall, width: number): string[] {
    const theme = this.#theme;
    const textWidth = Math.max(10, width - 6);
    const label = (name: string) => theme.fg("toolTitle", name);
    const block = (text: string, color: BodyColor) =>
      text
        .split("\n")
        .map((line) => displayLine(line))
        .flatMap((line) => (line.length > 0 ? wrapTextWithAnsi(line, textWidth) : [""]))
        .map((line) => `   ${theme.fg(color, line)}`);

    const status =
      call.status === "running"
        ? theme.fg("warning", "running")
        : call.status === "ok"
          ? theme.fg("success", "ok")
          : theme.fg("error", "error");
    const caller = call.parentId
      ? `codemode script ${theme.fg("dim", call.parentId)}`
      : "model (direct)";
    const result =
      call.result === undefined
        ? block(call.status === "running" ? "(still running)" : "(not kept in the session)", "dim")
        : block(call.result || "(empty)", call.status === "error" ? "error" : "toolOutput");

    return [
      ` ${label("Server:")} ${call.server}`,
      ` ${label("Status:")} ${status} ${theme.fg("dim", `· ${formatDuration(call.durationMs)}`)}`,
      ` ${label("Started:")} ${new Date(call.startedAt).toLocaleTimeString()}`,
      ` ${label("Called by:")} ${caller}`,
      "",
      ` ${label("Arguments:")}`,
      ...block(formatArgs(call.args), "toolOutput"),
      "",
      ` ${label("Result:")}`,
      ...result,
    ];
  }

  #renderDetail(call: TraceCall, width: number): string[] {
    const rows = this.#bodyRows;
    const lines = this.#detailLines(call, width);

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
