import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { safeRelativeReturnPath } from "../../../lib/supabase/return-path";
import { getSupabasePublicEnv } from "../../../lib/supabase/env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type CallbackClientFactory = (
  url: string,
  key: string,
  options: {
    cookies: {
      getAll(): Array<{ name: string; value: string }> | null;
      setAll(
        cookies: CookieToSet[],
        headers: Record<string, string>,
      ): void | Promise<void>;
    };
  },
) => {
  auth: {
    exchangeCodeForSession(
      code: string,
    ): Promise<{ error: unknown }>;
  };
};

const defaultCreateClient: CallbackClientFactory = (url, key, options) =>
  createServerClient(url, key, options);

export async function handleAuthCallback(
  request: NextRequest,
  createClient: CallbackClientFactory = defaultCreateClient,
): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeRelativeReturnPath(
    requestUrl.searchParams.get("next") ?? "/",
  );
  const response = NextResponse.redirect(new URL(next, requestUrl.origin), 303);

  if (code) {
    const { url, publishableKey } = getSupabasePublicEnv();
    const supabase = createClient(url, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value);
          }
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("error", "callback");
  response.headers.set("location", loginUrl.toString());
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAuthCallback(request);
}
