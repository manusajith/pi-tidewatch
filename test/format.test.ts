import assert from "node:assert/strict";
import test from "node:test";

import {
  formatArgs,
  formatDuration,
  formatResult,
  isErrorResult,
  summarizeArgs,
} from "../extensions/tidewatch/lib/format.ts";

test("summarizeArgs prefers the main Tidewave argument and collapses whitespace", () => {
  assert.equal(
    summarizeArgs({ code: "Repo.all(User)\n|> length()" }),
    "Repo.all(User) |> length()",
  );
  assert.equal(summarizeArgs({ query: "SELECT 1", arguments: [] }), "SELECT 1");
  assert.equal(summarizeArgs({ reference: "Enum.map/2" }), "Enum.map/2");
  assert.equal(summarizeArgs({ tail: 20 }), '{"tail":20}');
  assert.equal(summarizeArgs(null), "");
});

test("formatArgs shows code first and the remaining arguments as JSON", () => {
  assert.equal(formatArgs({ code: "1 + 1" }), "1 + 1");
  assert.equal(
    formatArgs({ query: "SELECT $1", arguments: [1] }),
    'SELECT $1\n\n{\n  "arguments": [\n    1\n  ]\n}',
  );
  assert.equal(formatArgs({ tail: 5 }), '{\n  "tail": 5\n}');
  assert.equal(formatArgs({ query: "SELECT 1", code: "1" }), 'SELECT 1\n\n{\n  "code": "1"\n}');
  assert.equal(formatArgs(null), "null");
});

test("formatResult joins MCP text content and labels other content", () => {
  const result = {
    content: [
      { type: "text", text: "line one" },
      { type: "image", data: "..." },
      { type: "text", text: "line two" },
    ],
  };
  assert.equal(formatResult(result), "line one\n[image content]\nline two");
  assert.equal(formatResult("plain"), "plain");
  assert.equal(formatResult({ ok: true }), '{\n  "ok": true\n}');
});

test("formatResult truncates very large results", () => {
  const text = formatResult("x".repeat(70 * 1024));
  assert.ok(text.length < 70 * 1024);
  assert.ok(text.endsWith("(truncated by tidewatch)"));
});

test("isErrorResult reads the MCP isError flag", () => {
  assert.equal(isErrorResult({ isError: true, content: [] }), true);
  assert.equal(isErrorResult({ content: [] }), false);
  assert.equal(isErrorResult("error"), false);
});

test("formatDuration switches to seconds after one second", () => {
  assert.equal(formatDuration(), "…");
  assert.equal(formatDuration(42), "42ms");
  assert.equal(formatDuration(1530), "1.5s");
});
