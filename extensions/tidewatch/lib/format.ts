const MAX_RESULT_CHARS = 64 * 1024;
const SUMMARY_KEYS = ["query", "code", "reference", "action", "grep", "path"] as const;
const MAIN_ARG_KEYS = ["query", "code"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "";
}

export function summarizeArgs(args: unknown): string {
  if (!isRecord(args)) return "";
  const value = SUMMARY_KEYS.map((key) => args[key]).find((candidate) => candidate !== undefined);
  const text = typeof value === "string" ? value : JSON.stringify(args);
  return text.replaceAll(/\s+/gu, " ").trim();
}

export function formatArgs(args: unknown): string {
  if (!isRecord(args)) return toJson(args);
  const mainKey = MAIN_ARG_KEYS.find((key) => typeof args[key] === "string");
  if (!mainKey) return toJson(args);
  const { [mainKey]: main, ...rest } = args;
  return Object.keys(rest).length > 0 ? `${String(main)}\n\n${toJson(rest)}` : String(main);
}

function contentPartText(part: unknown): string {
  if (isRecord(part) && part.type === "text" && typeof part.text === "string") return part.text;
  const type = isRecord(part) && typeof part.type === "string" ? part.type : "unknown";
  return `[${type} content]`;
}

export function formatResult(result: unknown): string {
  const text =
    isRecord(result) && Array.isArray(result.content)
      ? result.content.map((part) => contentPartText(part)).join("\n")
      : typeof result === "string"
        ? result
        : toJson(result);
  if (text.length <= MAX_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_RESULT_CHARS)}\n… (truncated by tidewatch)`;
}

export function isErrorResult(result: unknown): boolean {
  return isRecord(result) && result.isError === true;
}

export function formatDuration(ms?: number, running = false): string {
  if (ms === undefined) return running ? "…" : "-";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
