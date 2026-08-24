type SupabasePublicEnvSource = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
};

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
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
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

  return { url, publishableKey };
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return parseSupabasePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
