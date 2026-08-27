import assert from "node:assert/strict";
import test from "node:test";

import {
  PERMISSION_CODES,
  hasPermission,
  isPermissionCode,
  type PermissionCode,
} from "../lib/teams/permissions";

test("permission catalog contains the exact 21 database-backed codes", () => {
  assert.deepEqual(PERMISSION_CODES, [
    "team.read", "team.update", "team.delete", "members.read", "members.invite",
    "members.manage", "roles.read", "roles.manage", "settings.read", "settings.update",
    "players.read", "players.manage", "matches.read", "matches.manage", "matches.respond",
    "tactics.read", "tactics.manage", "news.read", "news.manage", "finance.read",
    "finance.manage",
  ]);
});

test("permission helpers recognize the catalog and fail closed for unknown strings", () => {
  assert.equal(isPermissionCode("team.delete"), true);
  assert.equal(isPermissionCode("finance.destroy"), false);
  assert.equal(isPermissionCode(""), false);
});

test("hasPermission returns only permissions present in a context", () => {
  const context: { permissions: readonly PermissionCode[] } = {
    permissions: ["team.read", "matches.read"],
  };

  assert.equal(hasPermission(context, "matches.read"), true);
  assert.equal(hasPermission(context, "finance.read"), false);
});

test("hasPermission does not mutate readonly serialized permissions", () => {
  const permissions = Object.freeze(["team.read", "matches.read"] as const);
  const context = Object.freeze({ permissions });

  assert.equal(hasPermission(context, "matches.read"), true);
  assert.deepEqual(context.permissions, ["team.read", "matches.read"]);
  assert.equal(Object.isFrozen(context.permissions), true);
});
