import assert from "node:assert/strict";
import test from "node:test";

import { displayLine } from "../extensions/tidewatch/lib/render.ts";

test("displayLine removes terminal escapes and control characters", () => {
  assert.equal(displayLine("\u001B[32m[info]\u001B[0m GET /users\r"), "[info] GET /users");
  assert.equal(displayLine("a\tb"), "a   b");
  assert.equal(displayLine("bell\u0007"), "bell");
});
