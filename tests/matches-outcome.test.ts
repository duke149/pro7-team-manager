import assert from "node:assert/strict";
import test from "node:test";

import { getMatchOutcome } from "../lib/matches/outcome";

test("completed match outcome maps win, draw, and loss to distinct semantic states", () => {
  assert.deepEqual(
    getMatchOutcome({ status: "completed", teamScore: 3, opponentScore: 1 }),
    { className: "win", label: "THẮNG" },
  );
  assert.deepEqual(
    getMatchOutcome({ status: "completed", teamScore: 2, opponentScore: 2 }),
    { className: "draw", label: "HÒA" },
  );
  assert.deepEqual(
    getMatchOutcome({ status: "completed", teamScore: 0, opponentScore: 1 }),
    { className: "loss", label: "THUA" },
  );
});

test("unfinished or scoreless matches never receive a result color", () => {
  assert.equal(
    getMatchOutcome({ status: "scheduled", teamScore: null, opponentScore: null }),
    null,
  );
  assert.equal(
    getMatchOutcome({ status: "cancelled", teamScore: null, opponentScore: null }),
    null,
  );
  assert.equal(
    getMatchOutcome({ status: "completed", teamScore: null, opponentScore: null }),
    null,
  );
});
