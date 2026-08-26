import assert from "node:assert/strict";
import test from "node:test";

import { provisionTeamMember } from "../lib/squad/provisioning-action";

const TEAM_ID = "00000000-0000-4000-8000-000000000001";
const ROLE_ID = "00000000-0000-4000-8000-000000000002";
const USER_ID = "00000000-0000-4000-8000-000000000003";
const BODY = {
  teamId: TEAM_ID,
  email: " Player@Example.com ",
  displayName: "  Nguyễn Minh Anh  ",
  roleId: ROLE_ID,
  shirtNumber: 17,
  officialPosition: "MID",
  joinDate: "2026-08-26",
};

function request(body: unknown = BODY, origin = "https://pro7.example") {
  return new Request("https://pro7.example/api/teams/pro7-fc/members", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fixture(options: { session?: string | null; invokeError?: unknown } = {}) {
  const permissions: string[] = [];
  const invocations: unknown[] = [];
  const context = {
    team: { id: TEAM_ID, slug: "pro7-fc", name: "PRO7 FC" },
    userId: USER_ID,
    membership: { roleId: ROLE_ID, roleSlug: "owner", roleName: "Owner" },
    permissions: ["players.manage", "members.manage"],
  };
  return {
    permissions,
    invocations,
    dependencies: {
      async requireTeamPermission(slug: string, permission: string) {
        permissions.push(`${slug}:${permission}`);
        return context;
      },
      supabase: {
        auth: { async getSession() { return { data: { session: options.session === null ? null : { access_token: options.session ?? "verified-token" } } }; } },
        functions: {
          async invoke(name: string, init: unknown) {
            invocations.push({ name, init });
            if (options.invokeError) return { data: null, error: options.invokeError };
            return { data: { ok: true, account: "created", userId: USER_ID, temporaryPassword: "Temp-Account-7!Secure#9" }, error: null };
          },
        },
      },
    },
  };
}

test("same-origin provisioning validates, authorizes both permissions, and forwards one verified request", async () => {
  const f = fixture();
  const response = await provisionTeamMember(request(), { slug: "pro7-fc" }, f.dependencies as never);
  assert.equal(response.status, 200);
  assert.deepEqual(f.permissions, ["pro7-fc:players.manage", "pro7-fc:members.manage"]);
  assert.deepEqual(f.invocations, [{
    name: "provision-team-member",
    init: {
      headers: { Authorization: "Bearer verified-token", Origin: "https://pro7.example" },
      body: { ...BODY, email: "player@example.com", displayName: "Nguyễn Minh Anh" },
    },
  }]);
  assert.equal((await response.json()).temporaryPassword, "Temp-Account-7!Secure#9");
});

test("provisioning rejects cross-origin requests before authorization", async () => {
  const f = fixture();
  const response = await provisionTeamMember(request(BODY, "https://attacker.example"), { slug: "pro7-fc" }, f.dependencies as never);
  assert.equal(response.status, 403);
  assert.deepEqual(f.permissions, []);
  assert.deepEqual(f.invocations, []);
});

test("provisioning fails closed when the server session is unavailable", async () => {
  const f = fixture({ session: null });
  const response = await provisionTeamMember(request(), { slug: "pro7-fc" }, f.dependencies as never);
  assert.equal(response.status, 401);
  assert.deepEqual(f.invocations, []);
});
