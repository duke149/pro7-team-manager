import assert from "node:assert/strict";
import test from "node:test";

import {
  executeAuthImport,
  isSupabaseProjectUrl,
  parseAuthImportArgs,
  planAuthImport,
  type ExistingAuthUser,
} from "../lib/roster/auth-import";
import { PRO7_ROSTER } from "../lib/roster/pro7-roster";

const LEGACY_USERS: ExistingAuthUser[] = [
  { id: "10000000-0000-4000-8000-000000000001", email: "duc.lee.pro7@example.com", appMetadata: {} },
  { id: "10000000-0000-4000-8000-000000000002", email: "tuan.dat.pro7@example.com", appMetadata: {} },
  { id: "10000000-0000-4000-8000-000000000003", email: "trung.hieu.pro7@example.com", appMetadata: {} },
  { id: "10000000-0000-4000-8000-000000000004", email: "phi.hung.pro7@example.com", appMetadata: {} },
  { id: "10000000-0000-4000-8000-000000000005", email: "unrelated@example.com", appMetadata: {} },
];

test("Auth import plans exactly three legacy updates and twenty creates without touching unrelated users", () => {
  const plan = planAuthImport(LEGACY_USERS, PRO7_ROSTER);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.actions.filter((action) => action.kind === "update").length, 3);
  assert.equal(plan.actions.filter((action) => action.kind === "create").length, 20);
  assert.deepEqual(
    plan.actions.filter((action) => action.kind === "update").map((action) => [action.username, action.userId]),
    [
      ["datlt", "10000000-0000-4000-8000-000000000002"],
      ["duclee", "10000000-0000-4000-8000-000000000001"],
      ["hieult", "10000000-0000-4000-8000-000000000003"],
    ],
  );
  assert.equal(plan.actions.some((action) => action.userId === "10000000-0000-4000-8000-000000000004"), false);
  assert.equal(plan.actions.some((action) => action.userId === "10000000-0000-4000-8000-000000000005"), false);
});

test("Auth import fails closed on missing legacy identity, duplicate email, or unmanaged target collision", () => {
  assert.deepEqual(planAuthImport(LEGACY_USERS.slice(1), PRO7_ROSTER), {
    ok: false,
    code: "legacy_missing",
    username: "duclee",
  });
  assert.deepEqual(planAuthImport([...LEGACY_USERS, { ...LEGACY_USERS[0], id: "duplicate" }], PRO7_ROSTER), {
    ok: false,
    code: "duplicate_email",
    email: "duc.lee.pro7@example.com",
  });
  assert.deepEqual(planAuthImport([
    ...LEGACY_USERS,
    { id: "collision", email: "hunglt@pro7.test", appMetadata: {} },
  ], PRO7_ROSTER), {
    ok: false,
    code: "target_collision",
    username: "hunglt",
  });
});

test("a previously managed target identity is updated idempotently while an ambiguous dual identity is denied", () => {
  const migrated = LEGACY_USERS.filter((user) => user.email !== "duc.lee.pro7@example.com").concat({
    id: "10000000-0000-4000-8000-000000000001",
    email: "duclee@pro7.test",
    appMetadata: { pro7_roster_team_slug: "pro7-fc", pro7_username: "duclee" },
  });
  const plan = planAuthImport(migrated, PRO7_ROSTER);
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.actions.find((action) => action.username === "duclee")?.userId, "10000000-0000-4000-8000-000000000001");
  }

  const ambiguous = planAuthImport([
    ...LEGACY_USERS,
    { id: "other", email: "duclee@pro7.test", appMetadata: { pro7_roster_team_slug: "pro7-fc", pro7_username: "duclee" } },
  ], PRO7_ROSTER);
  assert.deepEqual(ambiguous, { ok: false, code: "target_collision", username: "duclee" });
});

test("Auth execution sends bounded Admin payloads and never returns credentials", async () => {
  const plan = planAuthImport(LEGACY_USERS, PRO7_ROSTER);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const updates: Array<{
    id: string;
    email: string;
    hasNonEmptyPassword: boolean;
    role: unknown;
    displayName: unknown;
  }> = [];
  let createCount = 0;
  let createOrdinal = 0;
  const result = await executeAuthImport(plan, {
    authAdmin: {
      updateUserById: async (id, payload) => {
        updates.push({
          id,
          email: payload.email,
          hasNonEmptyPassword: typeof payload.password === "string" && payload.password.length > 0,
          role: payload.app_metadata.pro7_role,
          displayName: payload.user_metadata.display_name,
        });
        return { data: { user: { id, email: String(payload.email) } }, error: null };
      },
      createUser: async (payload) => {
        createCount += 1;
        createOrdinal += 1;
        return { data: { user: { id: `created-${createOrdinal}`, email: String(payload.email) } }, error: null };
      },
      deleteUser: async () => ({ data: {}, error: null }),
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(updates.length, 3);
  assert.equal(createCount, 20);
  assert.deepEqual(updates.find((item) => item.email === "duclee@pro7.test"), {
    id: "10000000-0000-4000-8000-000000000001",
    email: "duclee@pro7.test",
    hasNonEmptyPassword: true,
    role: "admin",
    displayName: "Lê Anh Đức",
  });
  assert.equal(JSON.stringify(result).includes("@123"), false);
  assert.equal("password" in result, false);
});

test("Auth execution rejects ambiguous Admin create and update responses", async () => {
  const planned = planAuthImport(LEGACY_USERS, PRO7_ROSTER);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  const update = planned.actions.find((action) => action.kind === "update");
  const create = planned.actions.find((action) => action.kind === "create");
  assert.ok(update && update.kind === "update");
  assert.ok(create && create.kind === "create");

  for (const user of [
    { id: "wrong-id", email: update.email },
    { id: update.userId, email: null },
    { id: update.userId, email: "wrong@example.com" },
  ]) {
    const result = await executeAuthImport({ ok: true, actions: [update] }, {
      authAdmin: {
        updateUserById: async () => ({ data: { user }, error: null }),
        createUser: async () => ({ data: null, error: new Error("unexpected") }),
        deleteUser: async () => ({ data: {}, error: null }),
      },
    });
    assert.deepEqual(result, { ok: false, code: "auth_failed", username: update.username });
  }

  for (const user of [
    { id: "created-user", email: null },
    { id: "created-user", email: "wrong@example.com" },
  ]) {
    const result = await executeAuthImport({ ok: true, actions: [create] }, {
      authAdmin: {
        updateUserById: async () => ({ data: null, error: new Error("unexpected") }),
        createUser: async () => ({ data: { user }, error: null }),
        deleteUser: async () => ({ data: {}, error: null }),
      },
    });
    assert.deepEqual(result, { ok: false, code: "auth_failed", username: create.username });
  }
});

test("a failed application commit compensates only newly created Auth users", async () => {
  const plan = planAuthImport(LEGACY_USERS, PRO7_ROSTER);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const deleted: string[] = [];
  let createOrdinal = 0;
  const result = await executeAuthImport(plan, {
    authAdmin: {
      updateUserById: async (id, payload) => ({ data: { user: { id, email: String(payload.email) } }, error: null }),
      createUser: async (payload) => {
        createOrdinal += 1;
        return { data: { user: { id: `created-${createOrdinal}`, email: String(payload.email) } }, error: null };
      },
      deleteUser: async (id) => {
        deleted.push(id);
        return { data: {}, error: null };
      },
    },
    commitApplicationData: async () => {
      throw new Error("database failed");
    },
  });

  assert.deepEqual(result, { ok: false, code: "application_failed", compensated: true });
  assert.equal(deleted.length, 20);
  assert.equal(deleted.some((id) => id.startsWith("10000000")), false);
});

test("Auth import CLI accepts only the pinned project and one explicit safe mode", () => {
  assert.deepEqual(parseAuthImportArgs(["--project-ref=pficsujapinkmqsyvcfw", "--preflight"]), {
    ok: true,
    projectRef: "pficsujapinkmqsyvcfw",
    mode: "preflight",
  });
  assert.deepEqual(parseAuthImportArgs(["--project-ref=pficsujapinkmqsyvcfw", "--apply"]), {
    ok: true,
    projectRef: "pficsujapinkmqsyvcfw",
    mode: "apply",
  });
  assert.deepEqual(parseAuthImportArgs(["--project-ref=wrong", "--apply"]), { ok: false, code: "arguments" });
  assert.deepEqual(parseAuthImportArgs(["--project-ref=pficsujapinkmqsyvcfw", "--apply", "--preflight"]), { ok: false, code: "arguments" });
  assert.deepEqual(parseAuthImportArgs(["--project-ref=pficsujapinkmqsyvcfw", "--password=secret"]), { ok: false, code: "arguments" });
});

test("Auth import CLI binds its Supabase URL to the pinned project ref", () => {
  assert.equal(
    isSupabaseProjectUrl("https://pficsujapinkmqsyvcfw.supabase.co", "pficsujapinkmqsyvcfw"),
    true,
  );
  assert.equal(
    isSupabaseProjectUrl("https://different-project.supabase.co", "pficsujapinkmqsyvcfw"),
    false,
  );
  assert.equal(
    isSupabaseProjectUrl("https://pficsujapinkmqsyvcfw.supabase.co.attacker.example", "pficsujapinkmqsyvcfw"),
    false,
  );
  assert.equal(
    isSupabaseProjectUrl("https://user@pficsujapinkmqsyvcfw.supabase.co?leak=1", "pficsujapinkmqsyvcfw"),
    false,
  );
});
