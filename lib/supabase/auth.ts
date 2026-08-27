import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import type { Database } from "./database.types";
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

export type ProductUser = { user: User; requiresPasswordChange: boolean };

export type ProductUserDependencies = {
  supabase?: Pick<SupabaseClient<Database>, "auth" | "from">;
  redirect?: (url: string) => never;
};

export async function getProductUser(
  next: string,
  dependencies: ProductUserDependencies = {},
): Promise<ProductUser | null> {
  safeRelativeReturnPath(next);
  const supabase = dependencies.supabase ?? (await createServerSupabaseClient());
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("requires_password_change")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("Không thể xác minh trạng thái tài khoản.");
  }

  return {
    user,
    requiresPasswordChange: profile.requires_password_change,
  };
}

export async function requireProductUser(
  next: string,
  dependencies: ProductUserDependencies = {},
): Promise<ProductUser> {
  const safeNext = safeRelativeReturnPath(next);
  const productUser = await getProductUser(safeNext, dependencies);
  const redirectTo = dependencies.redirect ?? redirect;

  if (!productUser) {
    return redirectTo(`/login?next=${encodeURIComponent(safeNext)}`);
  }

  if (
    productUser.requiresPasswordChange &&
    (new URL(safeNext, "https://app.local").pathname.replace(/\/+$/u, "") || "/") !==
      "/account/change-password"
  ) {
    return redirectTo("/account/change-password");
  }

  return productUser;
}
