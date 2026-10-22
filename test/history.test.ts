import assert from "node:assert/strict";
import test from "node:test";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { callsFromBranch } from "../extensions/tidewatch/lib/history.ts";

function messageEntry(id: string, message: unknown): SessionEntry {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: new Date(0).toISOString(),
    message,
  } as SessionEntry;
}

const branch: SessionEntry[] = [
  messageEntry("1", {
    role: "assistant",
    content: [
      { type: "text", text: "Checking the app" },
      {
        type: "toolCall",
        id: "direct",
        name: "mcp__tidewave__project_eval",
        arguments: { code: "1 + 1" },
      },
      { type: "toolCall", id: "script", name: "codemode", arguments: { code: "..." } },
    ],
  }),
  messageEntry("2", {
    role: "toolResult",
    toolCallId: "direct",
    toolName: "mcp__tidewave__project_eval",
    content: [{ type: "text", text: "2" }],
    isError: false,
    timestamp: 10_000,
    durationMs: 40,
  }),
  messageEntry("3", {
    role: "toolResult",
    toolCallId: "script",
    toolName: "codemode",
    content: [{ type: "text", text: "Script completed" }],
    isError: false,
    timestamp: 20_000,
    nestedCalls: {
      complete: false,
      calls: [
        {
          id: "script/1",
          name: "mcp__tidewave__execute_sql_query",
          arguments: { query: "SELECT 1" },
          status: "ok",
          durationMs: 5,
        },
        { id: "script/2", name: "read", arguments: { path: "mix.exs" }, status: "ok" },
        {
          id: "script/3",
          name: "mcp__tidewave__get_logs",
          argumentsBytes: 9000,
          status: "error",
          error: "boom",
        },
        { id: "script/4", name: "mcp__tidewave__get_docs", arguments: {}, status: "unfinished" },
      ],
    },
  }),
  { type: "label", id: "4", parentId: "3", timestamp: new Date(0).toISOString() } as SessionEntry,
];

test("callsFromBranch rebuilds direct Tidewave calls with their arguments and results", () => {
  const [direct] = callsFromBranch(branch);
  assert.deepEqual(direct, {
    id: "direct",
    toolName: "mcp__tidewave__project_eval",
    args: { code: "1 + 1" },
    startedAt: 9960,
    durationMs: 40,
    status: "ok",
    result: "2",
  });
});

test("callsFromBranch rebuilds Tidewave calls made from codemode scripts", () => {
  const nested = callsFromBranch(branch).slice(1);
  assert.deepEqual(
    nested.map(({ id, parentId, startedAt, startedBefore, status, result, args }) => ({
      id,
      parentId,
      startedAt,
      startedBefore,
      status,
      result,
      args,
    })),
    [
      {
        id: "script/1",
        parentId: "script",
        startedAt: 20_000,
        startedBefore: true,
        status: "ok",
        result: undefined,
        args: { query: "SELECT 1" },
      },
      {
        id: "script/3",
        parentId: "script",
        startedAt: 20_000,
        startedBefore: true,
        status: "error",
        result: "boom",
        args: { omitted: "9000 bytes" },
      },
      {
        id: "script/4",
        parentId: "script",
        startedAt: 20_000,
        startedBefore: true,
        status: "unfinished",
        result: "Still running when the codemode script finished.",
        args: {},
      },
    ],
  );
});

test("callsFromBranch drops calls made before the trace was cleared", () => {
  const cleared: SessionEntry[] = [
    ...branch,
    {
      type: "custom",
      customType: "tidewatch-clear",
      id: "5",
      parentId: "4",
      timestamp: new Date(0).toISOString(),
    } as SessionEntry,
    messageEntry("6", {
      role: "toolResult",
      toolCallId: "later",
      toolName: "mcp__tidewave__get_logs",
      content: [{ type: "text", text: "tail" }],
      isError: false,
      timestamp: 30_000,
    }),
  ];
  assert.deepEqual(
    callsFromBranch(cleared).map((call) => call.id),
    ["later"],
  );
});
