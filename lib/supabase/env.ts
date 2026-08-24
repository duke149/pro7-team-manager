type SupabasePublicEnvSource = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
};

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function isLegacyAnonKey(value: string): boolean {
  const segments = value.split(".");
  if (
    segments.length !== 3 ||
    segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
  ) {
    return false;
  }

  try {
    const decodeBase64Url = (segment: string): string => {
      const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
      const paddedBase64 = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        "=",
      );
      return globalThis.atob(paddedBase64);
    };
    const header: unknown = JSON.parse(decodeBase64Url(segments[0]));
    const payload: unknown = JSON.parse(decodeBase64Url(segments[1]));
    decodeBase64Url(segments[2]);
    return (
      typeof header === "object" &&
      header !== null &&
      "alg" in header &&
      header.alg === "HS256" &&
      typeof payload === "object" &&
      payload !== null &&
      "role" in payload &&
      payload.role === "anon"
    );
  } catch {
    return false;
  }
}

export function parseSupabasePublicEnv(
  source: SupabasePublicEnvSource,
): SupabasePublicEnv {
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add your Supabase project URL to the runtime environment.",
    );
  }

  try {
    const parsedUrl = new URL(url);
    if (
      (parsedUrl.protocol !== "https:" &&
        !(parsedUrl.protocol === "http:" && isLoopbackHostname(parsedUrl.hostname))) ||
      parsedUrl.username !== "" ||
      parsedUrl.password !== "" ||
      parsedUrl.search !== "" ||
      parsedUrl.hash !== ""
    ) {
      throw new Error("Unsupported protocol");
    }
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) URL, for example https://project.supabase.co.",
    );
  }

  const publishableKey = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add your Supabase publishable key to the runtime environment.",
    );
  }

  if (
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) &&
    !isLegacyAnonKey(publishableKey)
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key or a legacy anon key.",
    );
  }

  return { url, publishableKey };
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return parseSupabasePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
