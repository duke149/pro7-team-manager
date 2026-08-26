import { createClient } from "@supabase/supabase-js";

import {
  executeAuthImport,
  isSupabaseProjectUrl,
  parseAuthImportArgs,
  planAuthImport,
} from "../lib/roster/auth-import.ts";
import { PRO7_ROSTER } from "../lib/roster/pro7-roster.ts";

const parsed = parseAuthImportArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error("Invalid arguments. Use the pinned project ref with exactly --preflight or --apply.");
  process.exitCode = 2;
} else {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !isSupabaseProjectUrl(supabaseUrl, parsed.projectRef)) {
    console.error("Missing local Supabase Auth Admin environment.");
    process.exitCode = 2;
  } else {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const existingUsers = [];
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error("Unable to read Auth users for preflight.");
      existingUsers.push(...data.users.map((user) => ({
        id: user.id,
        email: user.email ?? "",
        appMetadata: user.app_metadata ?? {},
      })));
      if (data.users.length < 1000) break;
    }

    const plan = planAuthImport(existingUsers, PRO7_ROSTER);
    if (!plan.ok) {
      console.log(JSON.stringify({ ok: false, code: plan.code }));
      process.exitCode = 1;
    } else if (parsed.mode === "preflight") {
      console.log(JSON.stringify({
        ok: true,
        mode: "preflight",
        creates: plan.actions.filter((action) => action.kind === "create").length,
        updates: plan.actions.filter((action) => action.kind === "update").length,
      }));
    } else {
      const result = await executeAuthImport(plan, {
        authAdmin: {
          updateUserById: (id, payload) => supabase.auth.admin.updateUserById(id, payload),
          createUser: (payload) => supabase.auth.admin.createUser(payload),
          deleteUser: (id) => supabase.auth.admin.deleteUser(id),
        },
      });
      if (!result.ok) {
        console.log(JSON.stringify({ ok: false, code: result.code }));
        process.exitCode = 1;
      } else {
        console.log(JSON.stringify({
          ok: true,
          mode: "apply",
          created: result.createdCount,
          updated: result.updatedCount,
          usernames: result.users.map((user) => user.username),
        }));
      }
    }
  }
}
