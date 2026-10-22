import assert from "node:assert/strict";
import test from "node:test";

import { CallLog, parseToolName } from "../extensions/tidewatch/lib/calls.ts";

test("parseToolName matches Tidewave servers and ignores other tools", () => {
  assert.deepEqual(parseToolName("mcp__tidewave__project_eval"), {
    server: "tidewave",
    tool: "project_eval",
  });
  assert.deepEqual(parseToolName("mcp__tidewave_api__get_logs"), {
    server: "tidewave_api",
    tool: "get_logs",
  });
  assert.equal(parseToolName("mcp__github__search"), undefined);
  assert.equal(parseToolName("bash"), undefined);
});

test("start records Tidewave calls and skips everything else", () => {
  const log = new CallLog();
  assert.equal(log.start({ id: "a", toolName: "read", args: {} }), undefined);
  const call = log.start({
    id: "b",
    toolName: "mcp__tidewave__project_eval",
    args: { code: "1 + 1" },
    parentId: "script",
  });
  assert.equal(call?.seq, 1);
  assert.equal(call?.tool, "project_eval");
  assert.equal(call?.summary, "1 + 1");
  assert.equal(call?.parentId, "script");
  assert.equal(call?.status, "running");
  assert.equal(log.calls.length, 1);
});

test("finish stores the result, status, and duration", () => {
  const log = new CallLog();
  log.start({ id: "a", toolName: "mcp__tidewave__project_eval", args: {} });
  log.start({ id: "b", toolName: "mcp__tidewave__execute_sql_query", args: {} });

  log.finish("a", {
    result: { content: [{ type: "text", text: "2" }] },
    isError: false,
    durationMs: 12,
  });
  log.finish("b", { result: { isError: true, content: [] }, isError: false, durationMs: 3 });

  assert.deepEqual(
    log.calls.map(({ status, result, durationMs }) => ({ status, result, durationMs })),
    [
      { status: "ok", result: "2", durationMs: 12 },
      { status: "error", result: "", durationMs: 3 },
    ],
  );
  assert.deepEqual(log.counts(), { total: 2, running: 0, errors: 1 });
  assert.equal(log.finish("missing", { result: undefined, isError: false }), undefined);
});

test("the log keeps only the newest calls", () => {
  const log = new CallLog(2);
  for (const id of ["a", "b", "c"]) {
    log.start({ id, toolName: "mcp__tidewave__get_logs", args: {} });
  }
  assert.deepEqual(
    log.calls.map((call) => [call.id, call.seq]),
    [
      ["b", 2],
      ["c", 3],
    ],
  );
});

test("clear keeps numbering going while replace starts over", () => {
  const log = new CallLog();
  log.start({ id: "a", toolName: "mcp__tidewave__get_logs", args: {} });
  log.clear();
  assert.equal(log.start({ id: "b", toolName: "mcp__tidewave__get_logs", args: {} })?.seq, 2);

  log.replace([
    { id: "c", toolName: "mcp__tidewave__get_docs", args: {}, status: "ok", durationMs: 5 },
    { id: "d", toolName: "bash", args: {}, status: "ok" },
  ]);
  assert.deepEqual(
    log.calls.map((call) => [call.id, call.seq, call.status]),
    [["c", 1, "ok"]],
  );
});

test("subscribers hear about every change until they unsubscribe", () => {
  const log = new CallLog();
  let changes = 0;
  const unsubscribe = log.subscribe(() => {
    changes += 1;
  });
  log.start({ id: "a", toolName: "mcp__tidewave__get_logs", args: {} });
  log.finish("a", { result: "ok", isError: false });
  log.clear();
  unsubscribe();
  log.start({ id: "b", toolName: "mcp__tidewave__get_logs", args: {} });
  assert.equal(changes, 3);
});

test("finish updates the newest call when a provider reuses a call id", () => {
  const log = new CallLog();
  log.start({ id: "call_0", toolName: "mcp__tidewave__get_logs", args: {} });
  log.finish("call_0", { result: "first", isError: false, durationMs: 1 });
  log.start({ id: "call_0", toolName: "mcp__tidewave__get_logs", args: {} });
  log.finish("call_0", { result: "second", isError: false, durationMs: 2 });
  assert.deepEqual(
    log.calls.map((call) => [call.seq, call.result]),
    [
      [1, "first"],
      [2, "second"],
    ],
  );
  assert.equal(log.counts().running, 0);
});
