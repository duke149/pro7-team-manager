import {
  PRO7_LEGACY_RECONCILIATION,
  internalEmailForUsername,
  type Pro7RosterEntry,
} from "./pro7-roster";

export type ExistingAuthUser = Readonly<{
  id: string;
  email: string;
  appMetadata: Readonly<Record<string, unknown>>;
}>;

type AuthActionBase = Pro7RosterEntry & Readonly<{ email: string }>;
export type AuthImportAction =
  | (AuthActionBase & Readonly<{ kind: "create"; userId?: never }>)
  | (AuthActionBase & Readonly<{ kind: "update"; userId: string }>);

export type AuthImportPlan =
  | { ok: true; actions: readonly AuthImportAction[] }
  | { ok: false; code: "duplicate_email"; email: string }
  | { ok: false; code: "legacy_missing" | "target_collision"; username: string };

function normalizedEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

function isManagedTarget(user: ExistingAuthUser, username: string): boolean {
  return user.appMetadata.pro7_roster_team_slug === "pro7-fc"
    && user.appMetadata.pro7_username === username;
}

export function planAuthImport(
  existingUsers: readonly ExistingAuthUser[],
  roster: readonly Pro7RosterEntry[],
): AuthImportPlan {
  const byEmail = new Map<string, ExistingAuthUser>();
  for (const user of existingUsers) {
    const email = normalizedEmail(user.email);
    if (byEmail.has(email)) return { ok: false, code: "duplicate_email", email };
    byEmail.set(email, user);
  }

  const legacyByUsername = new Map(
    PRO7_LEGACY_RECONCILIATION.map((entry) => [entry.username, entry.legacyEmail] as const),
  );
  const actions: AuthImportAction[] = [];

  for (const entry of roster) {
    const email = internalEmailForUsername(entry.username);
    const legacyEmail = legacyByUsername.get(entry.username);
    const legacyUser = legacyEmail ? byEmail.get(legacyEmail) : undefined;
    const targetUser = byEmail.get(email);

    if (legacyUser && targetUser) {
      return { ok: false, code: "target_collision", username: entry.username };
    }
    if (legacyUser) {
      actions.push({ ...entry, email, kind: "update", userId: legacyUser.id });
      continue;
    }
    if (targetUser) {
      if (!isManagedTarget(targetUser, entry.username)) {
        return { ok: false, code: "target_collision", username: entry.username };
      }
      actions.push({ ...entry, email, kind: "update", userId: targetUser.id });
      continue;
    }
    if (legacyEmail) return { ok: false, code: "legacy_missing", username: entry.username };
    actions.push({ ...entry, email, kind: "create" });
  }

  return { ok: true, actions: Object.freeze(actions.map((action) => Object.freeze(action))) };
}

type AdminPayload = Readonly<{
  email: string;
  password: string;
  email_confirm: true;
  app_metadata: Readonly<Record<string, string>>;
  user_metadata: Readonly<{ display_name: string }>;
}>;

type AdminResult = Promise<{
  data: { user?: { id: string; email?: string | null } | null } | null;
  error: unknown | null;
}>;

export type AuthImportDependencies = Readonly<{
  authAdmin: {
    updateUserById: (id: string, payload: AdminPayload) => AdminResult;
    createUser: (payload: AdminPayload) => AdminResult;
    deleteUser: (id: string) => Promise<{ data: unknown; error: unknown | null }>;
  };
  commitApplicationData?: (
    users: readonly Readonly<{ id: string; username: string; kind: "create" | "update" }>[],
  ) => Promise<void>;
}>;

export type AuthImportExecutionResult =
  | {
      ok: true;
      users: readonly Readonly<{ id: string; username: string; kind: "create" | "update" }>[];
      createdCount: number;
      updatedCount: number;
    }
  | { ok: false; code: "auth_failed"; username: string }
  | { ok: false; code: "application_failed" | "compensation_failed"; compensated: boolean };

export function parseAuthImportArgs(args: readonly string[]):
  | { ok: true; projectRef: "pficsujapinkmqsyvcfw"; mode: "preflight" | "apply" }
  | { ok: false; code: "arguments" } {
  const allowed = new Set(["--project-ref=pficsujapinkmqsyvcfw", "--preflight", "--apply"]);
  if (args.some((arg) => !allowed.has(arg))) return { ok: false, code: "arguments" };
  if (!args.includes("--project-ref=pficsujapinkmqsyvcfw")) return { ok: false, code: "arguments" };
  const modes = ["preflight", "apply"].filter((mode) => args.includes(`--${mode}`));
  if (modes.length !== 1) return { ok: false, code: "arguments" };
  return {
    ok: true,
    projectRef: "pficsujapinkmqsyvcfw",
    mode: modes[0] as "preflight" | "apply",
  };
}

function payloadFor(action: AuthImportAction): AdminPayload {
  return {
    email: action.email,
    password: `${action.username}@123`,
    email_confirm: true,
    app_metadata: {
      pro7_roster_team_slug: "pro7-fc",
      pro7_username: action.username,
      pro7_role: action.role,
    },
    user_metadata: { display_name: action.displayName },
  };
}

export async function executeAuthImport(
  plan: Extract<AuthImportPlan, { ok: true }>,
  dependencies: AuthImportDependencies,
): Promise<AuthImportExecutionResult> {
  const users: Array<{ id: string; username: string; kind: "create" | "update" }> = [];
  const createdIds: string[] = [];

  for (const action of plan.actions) {
    const result = action.kind === "update"
      ? await dependencies.authAdmin.updateUserById(action.userId, payloadFor(action))
      : await dependencies.authAdmin.createUser(payloadFor(action));
    const user = result.data?.user;
    if (result.error || !user?.id) return { ok: false, code: "auth_failed", username: action.username };
    users.push({ id: user.id, username: action.username, kind: action.kind });
    if (action.kind === "create") createdIds.push(user.id);
  }

  if (dependencies.commitApplicationData) {
    try {
      await dependencies.commitApplicationData(Object.freeze(users.map((user) => Object.freeze(user))));
    } catch {
      let compensated = true;
      for (const id of [...createdIds].reverse()) {
        try {
          const result = await dependencies.authAdmin.deleteUser(id);
          if (result.error) compensated = false;
        } catch {
          compensated = false;
        }
      }
      return {
        ok: false,
        code: compensated ? "application_failed" : "compensation_failed",
        compensated,
      };
    }
  }

  return {
    ok: true,
    users: Object.freeze(users.map((user) => Object.freeze(user))),
    createdCount: createdIds.length,
    updatedCount: users.length - createdIds.length,
  };
}
