import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260824000000_supabase_mvp_core.sql",
  import.meta.url,
);

const publicTables = [
  "invitations",
  "memberships",
  "permissions",
  "profiles",
  "role_permissions",
  "roles",
  "team_settings",
  "teams",
];

const permissionCodes = [
  "members.invite",
  "members.manage",
  "members.read",
  "roles.manage",
  "roles.read",
  "settings.read",
  "settings.update",
  "team.delete",
  "team.read",
  "team.update",
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n\r]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]")
    .trim();
}

function findClosingParenthesis(source, openingIndex) {
  let depth = 0;
  let quote = null;

  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quote) {
      if (character === quote && next === quote) {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error(`Unbalanced SQL parentheses after offset ${openingIndex}`);
}

function extractTable(sql, qualifiedName) {
  const matcher = new RegExp(
    `create table(?: if not exists)? ${escapeRegex(qualifiedName)}\\s*\\(`,
  );
  const match = matcher.exec(sql);
  assert.ok(match, `missing CREATE TABLE for ${qualifiedName}`);
  const openingIndex = sql.indexOf("(", match.index);
  return sql.slice(openingIndex + 1, findClosingParenthesis(sql, openingIndex));
}

function extractFunction(sql, qualifiedName) {
  const matcher = new RegExp(
    `create or replace function ${escapeRegex(qualifiedName)}\\s*\\(`,
  );
  const match = matcher.exec(sql);
  assert.ok(match, `missing CREATE FUNCTION for ${qualifiedName}`);

  const remainder = sql.slice(match.index);
  const bodyStart = /\bas (\$[a-z0-9_]*\$)/.exec(remainder);
  assert.ok(bodyStart, `${qualifiedName} must use a dollar-quoted body`);
  const delimiter = bodyStart[1];
  const contentStart = bodyStart.index + bodyStart[0].length;
  const contentEnd = remainder.indexOf(delimiter, contentStart);
  assert.notEqual(contentEnd, -1, `${qualifiedName} has no closing body delimiter`);
  return remainder.slice(0, contentEnd + delimiter.length + 1);
}

function extractStatement(sql, startPattern, label) {
  const match = startPattern.exec(sql);
  assert.ok(match, `missing ${label}`);
  const end = sql.indexOf(";", match.index);
  assert.notEqual(end, -1, `${label} has no terminating semicolon`);
  return sql.slice(match.index, end + 1);
}

function extractStatements(sql, startPattern) {
  const statements = [];
  for (const match of sql.matchAll(startPattern)) {
    const end = sql.indexOf(";", match.index);
    assert.notEqual(end, -1, `statement at offset ${match.index} has no semicolon`);
    statements.push(sql.slice(match.index, end + 1));
  }
  return statements;
}

function assertClause(source, pattern, message) {
  assert.match(source, pattern, message);
}

function extractPolicy(sql, name) {
  return extractStatement(
    sql,
    new RegExp(`create policy ${escapeRegex(name)}\\b`),
    `policy ${name}`,
  );
}

function assertPolicy(sql, name, table, command, clauses) {
  const policy = extractPolicy(sql, name);
  assertClause(
    policy,
    new RegExp(
      `^create policy ${escapeRegex(name)} on public\\.${escapeRegex(table)} for ${command} to authenticated\\b`,
    ),
    `${name} must bind ${command.toUpperCase()} on public.${table} to authenticated`,
  );
  for (const clause of clauses) assertClause(policy, clause, `${name} is incomplete`);
  assert.doesNotMatch(policy, /\bfor all\b/, `${name} must be command-specific`);
}

test("the Supabase migration satisfies the reviewed schema and security contract", async (t) => {
  const rawSql = await readFile(migrationUrl, "utf8");
  const sql = normalizeSql(rawSql);

  await t.test("revokes broad defaults before creating application objects", () => {
    const requiredRevocations = [
      /alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from (?:public, )?anon, authenticated, service_role;/,
      /alter default privileges for role postgres revoke execute on functions from public;/,
      /alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;/,
      /alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated, service_role;/,
    ];
    const firstObject = Math.min(
      ...["create schema", "create table", "create or replace function"].map((token) => {
        const index = sql.indexOf(token);
        return index === -1 ? Number.POSITIVE_INFINITY : index;
      }),
    );
    assert.notEqual(firstObject, Number.POSITIVE_INFINITY, "migration creates no objects");
    for (const revocation of requiredRevocations) {
      const match = revocation.exec(sql);
      assert.ok(match, `missing default ACL revocation: ${revocation}`);
      assert.ok(match.index < firstObject, "default ACL revocations must precede object creation");
    }
  });

  await t.test("creates exactly the reviewed tables with tenant-safe constraints", () => {
    const createdTables = [...sql.matchAll(/create table(?: if not exists)? ([a-z_]+\.[a-z_]+)/g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(createdTables, [
      "private.audit_events",
      ...publicTables.map((name) => `public.${name}`),
    ].sort());

    const profiles = extractTable(sql, "public.profiles");
    assertClause(
      profiles,
      /id uuid primary key references auth\.users \(id\) on delete cascade/,
      "profiles.id must be the cascading auth.users key",
    );
    assertClause(
      profiles,
      /display_name text[\s\S]*check \(display_name is null or \(display_name = (?:pg_catalog\.)?btrim\(display_name\) and (?:pg_catalog\.)?char_length\(display_name\) between 1 and 100\)\)/,
      "display names must be trimmed and bounded",
    );
    assertClause(
      profiles,
      /avatar_url text[\s\S]*check \(avatar_url is null or \(avatar_url = (?:pg_catalog\.)?btrim\(avatar_url\) and (?:pg_catalog\.)?char_length\(avatar_url\) between 1 and 2048\)\)/,
      "avatar URLs must be trimmed and bounded",
    );

    const teams = extractTable(sql, "public.teams");
    assertClause(teams, /name text not null[\s\S]*char_length\(name\) between 1 and 100/, "team names must be bounded");
    assertClause(teams, /slug text not null[\s\S]*slug = lower\(slug\)[\s\S]*slug ~ '\^\[a-z0-9\]/, "team slugs must use a lowercase regex contract");
    assertClause(
      teams,
      /owner_user_id uuid not null default auth\.uid\(\) references auth\.users \(id\) on delete restrict/,
      "team ownership must default to the caller and restrict user deletion",
    );

    const roles = extractTable(sql, "public.roles");
    assertClause(roles, /team_id uuid not null references public\.teams \(id\) on delete cascade/, "roles must be team-scoped");
    assertClause(roles, /is_system boolean not null default false/, "roles need an immutable system flag");
    assertClause(roles, /unique \(team_id, slug\)/, "role slugs must be unique per team");
    assertClause(roles, /unique \(id, team_id\)/, "roles need a composite candidate key");

    const permissions = extractTable(sql, "public.permissions");
    assertClause(permissions, /code text primary key[\s\S]*code ~ '\^\[a-z\]/, "permission codes need the scope.action format check");

    const rolePermissions = extractTable(sql, "public.role_permissions");
    assertClause(rolePermissions, /primary key \(role_id, permission_code\)/, "role permission mappings need a composite key");
    assertClause(rolePermissions, /role_id uuid not null references public\.roles \(id\) on delete cascade/, "role permission roles must cascade");
    assertClause(rolePermissions, /permission_code text not null references public\.permissions \(code\) on delete cascade/, "permission catalog deletes must cascade mappings");

    const memberships = extractTable(sql, "public.memberships");
    assertClause(memberships, /primary key \(team_id, user_id\)/, "memberships need the tenant/user key");
    assertClause(memberships, /team_id uuid not null references public\.teams \(id\) on delete cascade/, "memberships must cascade with teams");
    assertClause(memberships, /user_id uuid not null references auth\.users \(id\) on delete cascade/, "memberships must cascade with users");
    assertClause(
      memberships,
      /foreign key \(role_id, team_id\) references public\.roles \(id, team_id\) on delete restrict/,
      "membership roles must belong to the same team",
    );
    assertClause(memberships, /joined_at timestamptz not null default (?:pg_catalog\.)?now\(\)/, "memberships need an immutable join timestamp");

    const invitations = extractTable(sql, "public.invitations");
    assertClause(invitations, /token_hash bytea not null unique/, "invitations must store only a unique SHA-256 hash");
    assertClause(invitations, /check \(octet_length\(token_hash\) = 32\)/, "invitation hashes must be exactly one SHA-256 digest");
    assert.doesNotMatch(invitations, /(?:^|,) token text\b/, "invitations must never store a raw token");
    assertClause(invitations, /email text not null[\s\S]*email = lower\(btrim\(email\)\)/, "invitation emails must be normalized");
    assertClause(invitations, /status text not null default 'pending'[\s\S]*status in \('pending', 'accepted', 'revoked'\)/, "invitation status must be closed over the reviewed states");
    assertClause(
      invitations,
      /foreign key \(role_id, team_id\) references public\.roles \(id, team_id\) on delete restrict/,
      "invitation roles must belong to the same team",
    );
    assertClause(
      invitations,
      /accepted_by_user_id uuid references auth\.users \(id\) on delete set null/,
      "deleted invitees must not erase accepted invitation history",
    );
    assertClause(
      invitations,
      /check \(\(status = 'accepted' and accepted_at is not null\) or \(status in \('pending', 'revoked'\) and accepted_at is null and accepted_by_user_id is null\)\)/,
      "accepted timestamps must survive user deletion while unaccepted states stay unattributed",
    );

    const settings = extractTable(sql, "public.team_settings");
    assertClause(settings, /team_id uuid primary key references public\.teams \(id\) on delete cascade/, "settings must be one-to-one with a team");
    assertClause(settings, /jsonb_typeof\(settings\) = 'object'/, "settings must be a JSON object");
    assertClause(settings, /pg_column_size\(settings\) <= 65536/, "settings must be bounded to 64 KiB");

    for (const table of ["profiles", "teams", "roles", "invitations", "team_settings"]) {
      const definition = extractTable(sql, `public.${table}`);
      assertClause(definition, /created_at timestamptz not null default (?:pg_catalog\.)?now\(\)/, `${table} needs created_at`);
      assertClause(definition, /updated_at timestamptz not null default (?:pg_catalog\.)?now\(\)/, `${table} needs updated_at`);
    }

    const audit = extractTable(sql, "private.audit_events");
    assertClause(audit, /id bigint generated always as identity primary key/, "audit IDs must use identity semantics");
    for (const column of ["occurred_at", "actor_user_id", "team_id", "table_name", "action", "row_key", "old_data", "new_data", "request_id"]) {
      assertClause(audit, new RegExp(`\\b${column}\\b`), `audit_events is missing ${column}`);
    }
  });

  await t.test("creates the reviewed unique, foreign-key, policy, and partial indexes", () => {
    const requiredIndexes = new Map([
      ["teams_slug_lower_key", /create unique index if not exists teams_slug_lower_key on public\.teams \(lower\(slug\)\);/],
      ["teams_owner_user_id_idx", /create index if not exists teams_owner_user_id_idx on public\.teams \(owner_user_id\);/],
      ["roles_team_id_idx", /create index if not exists roles_team_id_idx on public\.roles \(team_id\);/],
      ["memberships_user_id_team_id_idx", /create index if not exists memberships_user_id_team_id_idx on public\.memberships \(user_id, team_id\);/],
      ["memberships_role_id_idx", /create index if not exists memberships_role_id_idx on public\.memberships \(role_id\);/],
      ["role_permissions_permission_code_idx", /create index if not exists role_permissions_permission_code_idx on public\.role_permissions \(permission_code\);/],
      ["invitations_team_status_expires_at_idx", /create index if not exists invitations_team_status_expires_at_idx on public\.invitations \(team_id, status, expires_at\);/],
      ["invitations_role_id_idx", /create index if not exists invitations_role_id_idx on public\.invitations \(role_id\);/],
      ["invitations_inviter_user_id_idx", /create index if not exists invitations_inviter_user_id_idx on public\.invitations \(inviter_user_id\) where inviter_user_id is not null;/],
      ["invitations_accepted_by_user_id_idx", /create index if not exists invitations_accepted_by_user_id_idx on public\.invitations \(accepted_by_user_id\) where accepted_by_user_id is not null;/],
      ["invitations_pending_team_email_key", /create unique index if not exists invitations_pending_team_email_key on public\.invitations \(team_id, lower\(email\)\) where status = 'pending';/],
    ]);
    for (const [name, pattern] of requiredIndexes) {
      assertClause(sql, pattern, `${name} does not prove the reviewed access path`);
    }
  });

  await t.test("hardens all trusted functions and wires every reviewed trigger", () => {
    const privateFunctions = new Map([
      ["set_updated_at", ""],
      ["handle_new_user", ""],
      ["bootstrap_team", ""],
      ["is_team_member", "uuid"],
      ["has_team_permission", "uuid, text"],
      ["can_view_profile", "uuid"],
      ["can_manage_membership", "uuid, uuid"],
      ["role_belongs_to_team", "uuid, uuid"],
      ["can_view_role", "uuid"],
      ["can_manage_role", "uuid"],
      ["audit_row_change", ""],
    ]);
    const declaredFunctions = [...sql.matchAll(/create or replace function ([a-z_]+\.[a-z_]+)\s*\(/g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(declaredFunctions, [
      ...[...privateFunctions.keys()].map((name) => `private.${name}`),
      "public.accept_team_invitation",
    ].sort());

    for (const [name, signature] of privateFunctions) {
      const qualifiedName = `private.${name}`;
      const definition = extractFunction(sql, qualifiedName);
      assertClause(definition, /\bsecurity definer\b/, `${qualifiedName} must be SECURITY DEFINER`);
      assertClause(definition, /\bset search_path = ''/, `${qualifiedName} must have an empty search path`);
      assertClause(
        sql,
        new RegExp(`alter function ${escapeRegex(qualifiedName)}\\(${escapeRegex(signature)}\\) owner to postgres;`),
        `${qualifiedName} must be owned by postgres`,
      );
      assertClause(
        sql,
        new RegExp(`revoke execute on function ${escapeRegex(qualifiedName)}\\(${escapeRegex(signature)}\\) from public, anon, authenticated, service_role;`),
        `${qualifiedName} must not be directly executable by API roles`,
      );
    }

    const authorizationHelpers = ["is_team_member", "has_team_permission", "can_view_profile", "can_manage_membership", "role_belongs_to_team", "can_view_role", "can_manage_role"];
    const policyInvokedHelpers = new Set(["has_team_permission", "can_view_profile", "can_manage_membership", "role_belongs_to_team", "can_view_role", "can_manage_role"]);
    for (const name of authorizationHelpers) {
      const definition = extractFunction(sql, `private.${name}`);
      assertClause(definition, /\bstable\b/, `private.${name} must be STABLE`);
      assertClause(definition, /\(select auth\.uid\(\)\)/, `private.${name} must derive the caller from auth.uid()`);
      assert.doesNotMatch(
        definition.slice(0, definition.indexOf("returns")),
        /\b(?:caller|current)_user_id\b/,
        `private.${name} must not accept a caller identity parameter`,
      );
      if (policyInvokedHelpers.has(name)) {
        assertClause(
          sql,
          new RegExp(`grant execute on function private\\.${name}\\([^)]*\\) to authenticated;`),
          `private.${name} needs an explicit internal policy-execution grant`,
        );
      }
    }

    const roleBelongsToTeam = extractFunction(sql, "private.role_belongs_to_team");
    assertClause(
      roleBelongsToTeam,
      /where r\.id = p_role_id and r\.team_id = p_team_id and not \(r\.is_system and r\.slug = 'owner'\)/,
      "membership assignment must reject the canonical system owner role",
    );

    const canManageMembership = extractFunction(sql, "private.can_manage_membership");
    assertClause(
      canManageMembership,
      /from public\.teams as t where t\.id = p_team_id and t\.owner_user_id <> p_target_user_id and private\.has_team_permission\(p_team_id, 'members\.manage'\)/,
      "membership management must be team-authorized and always deny the canonical owner",
    );

    const canManageRole = extractFunction(sql, "private.can_manage_role");
    assertClause(
      canManageRole,
      /from public\.roles as r where r\.id = p_role_id and not r\.is_system and private\.has_team_permission\(r\.team_id, 'roles\.manage'\)/,
      "role management must be team-authorized and deny every system role",
    );

    assertClause(
      sql,
      /revoke all on schema private from public, anon, authenticated, service_role;/,
      "API roles must not be able to resolve private helpers for direct calls",
    );
    assert.doesNotMatch(
      sql,
      /pg_catalog\.(?:coalesce|nullif|case)\b/,
      "SQL special forms cannot be schema-qualified inside hardened helpers",
    );

    const expectedTriggers = new Map([
      ["on_auth_user_created", ["after insert", "auth.users", "private.handle_new_user"]],
      ["trg_teams_bootstrap", ["after insert", "public.teams", "private.bootstrap_team"]],
      ["trg_profiles_set_updated_at", ["before update", "public.profiles", "private.set_updated_at"]],
      ["trg_teams_set_updated_at", ["before update", "public.teams", "private.set_updated_at"]],
      ["trg_roles_set_updated_at", ["before update", "public.roles", "private.set_updated_at"]],
      ["trg_invitations_set_updated_at", ["before update", "public.invitations", "private.set_updated_at"]],
      ["trg_team_settings_set_updated_at", ["before update", "public.team_settings", "private.set_updated_at"]],
      ["trg_teams_audit", ["after insert or update or delete", "public.teams", "private.audit_row_change"]],
      ["trg_memberships_audit", ["after insert or update or delete", "public.memberships", "private.audit_row_change"]],
      ["trg_roles_audit", ["after insert or update or delete", "public.roles", "private.audit_row_change"]],
      ["trg_role_permissions_audit", ["after insert or update or delete", "public.role_permissions", "private.audit_row_change"]],
      ["trg_invitations_audit", ["after insert or update or delete", "public.invitations", "private.audit_row_change"]],
      ["trg_team_settings_audit", ["after insert or update or delete", "public.team_settings", "private.audit_row_change"]],
    ]);
    const triggerNames = [...sql.matchAll(/create trigger ([a-z_]+)/g)].map((match) => match[1]).sort();
    assert.deepEqual(triggerNames, [...expectedTriggers.keys()].sort());
    for (const [name, [timing, relation, handler]] of expectedTriggers) {
      const trigger = extractStatement(sql, new RegExp(`create trigger ${name}\\b`), `trigger ${name}`);
      assertClause(
        trigger,
        new RegExp(`^create trigger ${name} ${timing} on ${escapeRegex(relation)} for each row execute function ${escapeRegex(handler)}\\(\\);$`),
        `${name} is attached to the wrong event, table, or function`,
      );
    }
  });

  await t.test("seeds the exact permission catalog and system-role mappings", () => {
    const permissionSeed = extractStatement(
      sql,
      /insert into public\.permissions\s*\(/,
      "permission catalog seed",
    );
    const seededCodes = [...permissionSeed.matchAll(/'([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)'/g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(seededCodes, permissionCodes);
    assertClause(permissionSeed, /on conflict \(code\) do update set description = excluded\.description;/, "permission seeding must be history-safe");

    const bootstrap = extractFunction(sql, "private.bootstrap_team");
    const roleSeed = extractStatement(
      bootstrap,
      /insert into public\.roles\s*\(/,
      "bootstrap role seed",
    );
    for (const [variable, slug] of [["v_owner_role_id", "owner"], ["v_admin_role_id", "admin"], ["v_member_role_id", "member"]]) {
      assertClause(roleSeed, new RegExp(`\\(${variable}, new\\.id, '${slug}', '${slug}', [^)]*true\\)`), `${slug} must be a system role`);
    }

    const mappingStatements = extractStatements(
      bootstrap,
      /insert into public\.role_permissions\s*\(/g,
    );
    assert.equal(mappingStatements.length, 3, "bootstrap must have one explicit mapping statement per system role");
    const ownerMapping = mappingStatements.find((statement) => statement.includes("v_owner_role_id"));
    const adminMapping = mappingStatements.find((statement) => statement.includes("v_admin_role_id"));
    const memberMapping = mappingStatements.find((statement) => statement.includes("v_member_role_id"));
    assert.ok(ownerMapping && adminMapping && memberMapping, "owner/admin/member mappings must all be present");
    assertClause(ownerMapping, /select v_owner_role_id, p\.code from public\.permissions as p;/, "owner must receive every catalog permission");
    assertClause(adminMapping, /select v_admin_role_id, p\.code from public\.permissions as p where p\.code <> 'team\.delete';/, "admin must receive every permission except team.delete");
    const memberCodes = [...memberMapping.matchAll(/'(team\.read|members\.read|roles\.read|settings\.read)'/g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(memberCodes, ["members.read", "roles.read", "settings.read", "team.read"]);
    assertClause(memberMapping, /where p\.code = any \(array\[[^\]]+\]::text\[\]\);/, "member mappings must be restricted by an explicit literal allowlist");

    assertClause(bootstrap, /insert into public\.memberships \(team_id, user_id, role_id\) values \(new\.id, new\.owner_user_id, v_owner_role_id\);/, "bootstrap must create the owner membership");
    assertClause(bootstrap, /insert into public\.team_settings \(team_id\) values \(new\.id\);/, "bootstrap must create default settings");
  });

  await t.test("enables RLS and defines only the reviewed command policies", () => {
    const rlsTables = [...sql.matchAll(/alter table public\.([a-z_]+) enable row level security;/g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(rlsTables, publicTables);

    const policyNames = [...sql.matchAll(/create policy ([a-z_]+)/g)].map((match) => match[1]).sort();
    assert.deepEqual(policyNames, [
      "invitations_select_authorized",
      "memberships_delete_authorized",
      "memberships_select_authorized",
      "memberships_update_authorized",
      "permissions_select_authenticated",
      "profiles_select_visible",
      "profiles_update_own",
      "role_permissions_delete_authorized",
      "role_permissions_insert_authorized",
      "role_permissions_select_authorized",
      "roles_delete_custom",
      "roles_insert_custom",
      "roles_select_authorized",
      "roles_update_custom",
      "team_settings_select_authorized",
      "team_settings_update_authorized",
      "teams_delete_authorized",
      "teams_insert_own",
      "teams_select_authorized",
      "teams_update_authorized",
    ].sort());

    assertPolicy(sql, "profiles_select_visible", "profiles", "select", [/using \(private\.can_view_profile\(id\)\)/]);
    assertPolicy(sql, "profiles_update_own", "profiles", "update", [
      /using \(\(select auth\.uid\(\)\) = id\)/,
      /with check \(\(select auth\.uid\(\)\) = id\)/,
    ]);
    assertPolicy(sql, "teams_select_authorized", "teams", "select", [/using \(private\.has_team_permission\(id, 'team\.read'\)\)/]);
    assertPolicy(sql, "teams_insert_own", "teams", "insert", [/with check \(\(select auth\.uid\(\)\) = owner_user_id\)/]);
    assertPolicy(sql, "teams_update_authorized", "teams", "update", [
      /using \(private\.has_team_permission\(id, 'team\.update'\)\)/,
      /with check \(private\.has_team_permission\(id, 'team\.update'\)\)/,
    ]);
    assertPolicy(sql, "teams_delete_authorized", "teams", "delete", [/using \(private\.has_team_permission\(id, 'team\.delete'\)\)/]);
    assertPolicy(sql, "memberships_select_authorized", "memberships", "select", [
      /using \(user_id = \(select auth\.uid\(\)\) or private\.has_team_permission\(team_id, 'members\.read'\)\)/,
    ]);
    assertPolicy(sql, "memberships_update_authorized", "memberships", "update", [
      /using \(private\.can_manage_membership\(team_id, user_id\)\)/,
      /with check \(private\.can_manage_membership\(team_id, user_id\) and private\.role_belongs_to_team\(role_id, team_id\)\)/,
    ]);
    assertPolicy(sql, "memberships_delete_authorized", "memberships", "delete", [/using \(private\.can_manage_membership\(team_id, user_id\)\)/]);
    assertPolicy(sql, "roles_select_authorized", "roles", "select", [/using \(private\.can_view_role\(id\)\)/]);
    assertPolicy(sql, "roles_insert_custom", "roles", "insert", [
      /with check \(not is_system and private\.has_team_permission\(team_id, 'roles\.manage'\)\)/,
    ]);
    assertPolicy(sql, "roles_update_custom", "roles", "update", [
      /using \(not is_system and private\.has_team_permission\(team_id, 'roles\.manage'\)\)/,
      /with check \(not is_system and private\.has_team_permission\(team_id, 'roles\.manage'\)\)/,
    ]);
    assertPolicy(sql, "roles_delete_custom", "roles", "delete", [
      /using \(not is_system and private\.has_team_permission\(team_id, 'roles\.manage'\)\)/,
    ]);
    assertPolicy(sql, "permissions_select_authenticated", "permissions", "select", [/using \(true\)/]);
    assertPolicy(sql, "role_permissions_select_authorized", "role_permissions", "select", [/using \(private\.can_view_role\(role_id\)\)/]);
    assertPolicy(sql, "role_permissions_insert_authorized", "role_permissions", "insert", [
      /with check \(private\.can_manage_role\(role_id\) and permission_code <> 'team\.delete'\)/,
    ]);
    assertPolicy(sql, "role_permissions_delete_authorized", "role_permissions", "delete", [/using \(private\.can_manage_role\(role_id\)\)/]);
    assertPolicy(sql, "invitations_select_authorized", "invitations", "select", [/using \(private\.has_team_permission\(team_id, 'members\.invite'\)\)/]);
    assertPolicy(sql, "team_settings_select_authorized", "team_settings", "select", [/using \(private\.has_team_permission\(team_id, 'settings\.read'\)\)/]);
    assertPolicy(sql, "team_settings_update_authorized", "team_settings", "update", [
      /using \(private\.has_team_permission\(team_id, 'settings\.update'\)\)/,
      /with check \(private\.has_team_permission\(team_id, 'settings\.update'\)\)/,
    ]);

    assert.doesNotMatch(sql, /auth\.role\(\)/, "policies must use TO roles, not auth.role()");
    assert.doesNotMatch(sql, /(?:user|app)_metadata/, "authorization must never depend on JWT metadata");
  });

  await t.test("exposes only the reviewed object and column privileges", () => {
    assert.doesNotMatch(sql, /\bgrant\b[^;]*\bto anon\b/, "anon must receive no application grants");
    assert.doesNotMatch(sql, /\bgrant all(?: privileges)?\b/, "application roles must never receive broad ALL grants");

    const tableGrants = [
      /grant select on table public\.profiles to authenticated;/,
      /grant select, delete on table public\.teams to authenticated;/,
      /grant select, delete on table public\.memberships to authenticated;/,
      /grant select, delete on table public\.roles to authenticated;/,
      /grant select on table public\.permissions to authenticated;/,
      /grant select, insert, delete on table public\.role_permissions to authenticated;/,
      /grant select on table public\.team_settings to authenticated;/,
    ];
    for (const grant of tableGrants) assertClause(sql, grant, `missing authenticated grant ${grant}`);

    const writeGrants = extractStatements(sql, /grant (?:insert|update) \([^)]*\) on table public\.[a-z_]+ to authenticated;/g);
    assert.deepEqual(writeGrants.sort(), [
      "grant insert (name, slug) on table public.teams to authenticated;",
      "grant insert (team_id, slug, name, description) on table public.roles to authenticated;",
      "grant update (display_name, avatar_url) on table public.profiles to authenticated;",
      "grant update (name, description) on table public.roles to authenticated;",
      "grant update (name, slug) on table public.teams to authenticated;",
      "grant update (role_id) on table public.memberships to authenticated;",
      "grant update (settings) on table public.team_settings to authenticated;",
    ].sort());

    const invitationGrant = extractStatement(
      sql,
      /grant select \([^)]*\) on table public\.invitations to authenticated;/,
      "safe invitation column grant",
    );
    assert.doesNotMatch(invitationGrant, /\btoken_hash\b/, "authenticated users must not select invitation hashes");
    const invitationColumns = invitationGrant
      .match(/grant select \(([^)]*)\)/)[1]
      .split(",")
      .map((column) => column.trim())
      .sort();
    assert.deepEqual(invitationColumns, [
      "accepted_at",
      "accepted_by_user_id",
      "created_at",
      "email",
      "expires_at",
      "id",
      "inviter_user_id",
      "role_id",
      "status",
      "team_id",
      "updated_at",
    ].sort());

    const serviceGrant = extractStatement(
      sql,
      /grant select, insert, update, delete on table [^;]+ to service_role;/,
      "service-role application-table grant",
    );
    const serviceTables = serviceGrant
      .match(/on table (.+) to service_role;/)[1]
      .split(",")
      .map((tableName) => tableName.trim().replace(/^public\./, ""))
      .sort();
    assert.deepEqual(serviceTables, publicTables);

    assertClause(
      sql,
      /revoke all privileges on table private\.audit_events from public, anon, authenticated, service_role;/,
      "audit rows must be inaccessible to all API roles",
    );
    assert.doesNotMatch(sql, /grant [^;]+ on (?:table |schema )?private\./, "private tables and schemas must not receive API grants");
    const privateFunctionGrants = extractStatements(
      sql,
      /grant execute on function private\.[a-z_]+\([^)]*\) to authenticated;/g,
    );
    assert.deepEqual(
      privateFunctionGrants
        .map((statement) => statement.match(/function private\.([a-z_]+)/)[1])
        .sort(),
      ["can_manage_membership", "can_manage_role", "can_view_profile", "can_view_role", "has_team_permission", "role_belongs_to_team"],
      "only RLS policy helpers may receive private function execution grants",
    );
  });

  await t.test("accepts invitations atomically without exposing tokens and redacts audit JSON", () => {
    const rpc = extractFunction(sql, "public.accept_team_invitation");
    assertClause(
      rpc,
      /^create or replace function public\.accept_team_invitation\(token text\)/,
      "the PostgREST RPC argument must preserve the public token interface",
    );
    assertClause(rpc, /returns uuid/, "invitation acceptance must return the team ID");
    assertClause(rpc, /\bsecurity definer\b/, "invitation acceptance must be trusted code");
    assertClause(rpc, /\bset search_path = ''/, "invitation acceptance must have an empty search path");
    assertClause(rpc, /v_user_id := \(select auth\.uid\(\)\)/, "RPC identity must come from auth.uid()");
    assertClause(rpc, /extensions\.digest\(token, 'sha256'\)/, "RPC must hash the presented token with SHA-256");
    assertClause(rpc, /from public\.invitations as i[\s\S]*i\.status = 'pending'[\s\S]*i\.expires_at > (?:pg_catalog\.)?now\(\)[\s\S]*for update/, "RPC must row-lock a pending unexpired invitation");
    assertClause(
      rpc,
      /and exists \(select 1 from public\.roles as invitation_role where invitation_role\.id = i\.role_id and invitation_role\.team_id = i\.team_id and not \(invitation_role\.is_system and invitation_role\.slug = 'owner'\)\)[\s\S]*for update/,
      "RPC must reject invitations that target the canonical system owner role",
    );
    assertClause(rpc, /from auth\.users as u[\s\S]*u\.email_confirmed_at is not null[\s\S]*u\.email is not null/, "RPC must require a non-null confirmed auth email");
    assertClause(rpc, /lower\(btrim\(u\.email\)\)/, "RPC must normalize the caller email");
    assertClause(rpc, /if not found or v_confirmed_email is null or v_confirmed_email <> v_invitation\.email then/, "RPC must fail closed when no comparable email exists");
    assertClause(rpc, /insert into public\.memberships \(team_id, user_id, role_id\)/, "RPC must create the accepted membership");
    assertClause(rpc, /on conflict \(team_id, user_id\) do nothing/, "RPC must make existing membership failures generic");
    assertClause(rpc, /update public\.invitations set status = 'accepted', accepted_at = (?:pg_catalog\.)?now\(\), accepted_by_user_id = v_user_id/, "RPC must consume the invitation");
    assertClause(rpc, /v_failure_message constant text := 'invitation is invalid or unavailable'/, "RPC must define one generic rejection message");
    assert.doesNotMatch(rpc, /raise[^;]+(?:expired|revoked|email|replay|token)/, "RPC errors must not reveal why acceptance failed");

    assertClause(sql, /alter function public\.accept_team_invitation\(text\) owner to postgres;/, "RPC must be owned by postgres");
    assertClause(sql, /revoke execute on function public\.accept_team_invitation\(text\) from public, anon, authenticated, service_role;/, "RPC must begin closed");
    assertClause(sql, /grant execute on function public\.accept_team_invitation\(text\) to authenticated;/, "only authenticated may execute the RPC");

    const audit = extractFunction(sql, "private.audit_row_change");
    assertClause(audit, /if tg_table_name = 'invitations' then old_data := old_data - 'token_hash';/, "old invitation audit JSON must redact token_hash");
    assertClause(audit, /new_data := new_data - 'token_hash';/, "new invitation audit JSON must redact token_hash");
    assertClause(audit, /insert into private\.audit_events[\s\S]*old_data[\s\S]*new_data/, "audit inserts must use the redacted values");
    assert.doesNotMatch(audit, /p_token|raw_token/, "audit code must never receive a raw invitation token");
  });

  await t.test("is safe to retain as one repeatable history migration", () => {
    assertClause(sql, /^begin;/, "the migration must begin atomically");
    assertClause(sql, /commit;$/, "the migration must commit atomically");
    assertClause(sql, /create schema if not exists private;/, "private schema creation must be repeatable");
    assert.equal(
      [...sql.matchAll(/create table if not exists /g)].length,
      9,
      "all application tables must use IF NOT EXISTS",
    );
    const createdIndexCount = [...sql.matchAll(/create (?:unique )?index /g)].length;
    assert.equal(
      [...sql.matchAll(/create (?:unique )?index if not exists /g)].length,
      createdIndexCount,
      "every index must use IF NOT EXISTS",
    );
    for (const policy of [...sql.matchAll(/create policy ([a-z_]+) on public\.([a-z_]+)/g)]) {
      assertClause(
        sql,
        new RegExp(`drop policy if exists ${policy[1]} on public\\.${policy[2]};`),
        `policy ${policy[1]} must be replaced history-safely`,
      );
    }
    for (const trigger of [...sql.matchAll(/create trigger ([a-z_]+)[^;]+ on ([a-z_]+\.[a-z_]+)/g)]) {
      assertClause(
        sql,
        new RegExp(`drop trigger if exists ${trigger[1]} on ${escapeRegex(trigger[2])};`),
        `trigger ${trigger[1]} must be replaced history-safely`,
      );
    }
  });
});
