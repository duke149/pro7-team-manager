import { safeRelativeReturnPath } from "../../../lib/supabase/return-path";
import { createServerSupabaseClient } from "../../../lib/supabase/server";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeRelativeReturnPath(
    requestUrl.searchParams.get("next") ?? "/",
  );

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return Response.redirect(new URL(next, requestUrl.origin), 303);
    }
  }

  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("error", "callback");
  return Response.redirect(loginUrl, 303);
}
