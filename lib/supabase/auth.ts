import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "./server";
import { safeRelativeReturnPath } from "./return-path";

export { safeRelativeReturnPath } from "./return-path";

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return error ? null : user;
}

export async function requireCurrentUser(returnTo: string): Promise<User> {
  const user = await getCurrentUser();
  if (user) return user;

  const next = safeRelativeReturnPath(returnTo);
  redirect(`/login?next=${encodeURIComponent(next)}`);
}
