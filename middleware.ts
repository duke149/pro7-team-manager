import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSupabasePublicEnv } from "./lib/supabase/env";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type MiddlewareClientFactory = (
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
) => { auth: { getUser(): Promise<unknown> } };

const defaultCreateClient: MiddlewareClientFactory = (url, key, options) =>
  createServerClient(url, key, options);

function cookieKey(cookie: CookieToSet): string {
  return [
    cookie.name,
    cookie.options.domain ?? "",
    cookie.options.path ?? "",
  ].join("\u0000");
}

export async function refreshSupabaseSession(
  request: NextRequest,
  createClient: MiddlewareClientFactory = defaultCreateClient,
): Promise<NextResponse> {
  const { url, publishableKey } = getSupabasePublicEnv();
  const responseCookies = new Map<string, CookieToSet>();
  const responseHeaders = new Headers();
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          responseCookies.set(cookieKey(cookie), cookie);
        }
        for (const [name, value] of Object.entries(headers)) {
          responseHeaders.set(name, value);
        }

        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of responseCookies.values()) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of responseHeaders) {
          response.headers.set(name, value);
        }
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!auth/callback(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
