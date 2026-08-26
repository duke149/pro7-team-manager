import assert from "node:assert/strict";
import test from "node:test";

import { parseSquadFilters } from "../lib/squad/filters";

test("parseSquadFilters trims search text and escapes literal PostgREST ilike wildcards", () => {
  const filters = parseSquadFilters(
    new URLSearchParams({ q: "  50%_\\ club  ", position: "GK" }),
  );

  assert.deepEqual(filters, {
    q: "50%_\\ club",
    searchPattern: "%50\\%\\_\\\\ club%",
    position: "GK",
    status: "active",
    sort: "name",
    direction: "asc",
  });
});

test("parseSquadFilters drops an overlong search instead of emitting an unbounded pattern", () => {
  const filters = parseSquadFilters(new URLSearchParams({ q: "x".repeat(81) }));

  assert.equal(filters.q, "");
  assert.equal(filters.searchPattern, null);
});

test("parseSquadFilters fails closed for unknown position, status, sort, and direction values", () => {
  const filters = parseSquadFilters(
    new URLSearchParams({
      position: "name.ilike.*",
      status: "all",
      sort: "admin_notes",
      direction: "sideways",
    }),
  );

  assert.deepEqual(filters, {
    q: "",
    searchPattern: null,
    position: "all",
    status: "active",
    sort: "name",
    direction: "asc",
  });
});

test("parseSquadFilters uses descending join date only when selected without a valid direction", () => {
  assert.equal(
    parseSquadFilters(new URLSearchParams({ sort: "join_date" })).direction,
    "desc",
  );
  assert.equal(
    parseSquadFilters(
      new URLSearchParams({ sort: "join_date", direction: "asc" }),
    ).direction,
    "asc",
  );
  assert.equal(
    parseSquadFilters(new URLSearchParams({ direction: "desc" })).direction,
    "desc",
  );
});

test("parseSquadFilters returns an immutable snapshot without mutating caller parameters", () => {
  const parameters = new URLSearchParams({ q: "  An  ", status: "injured" });
  const before = parameters.toString();
  const filters = parseSquadFilters(parameters);

  assert.equal(parameters.toString(), before);
  assert.equal(Object.isFrozen(filters), true);
  assert.throws(() => {
    (filters as { q: string }).q = "changed";
  }, TypeError);
});
