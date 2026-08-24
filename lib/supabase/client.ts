import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./env";

let browserClient: SupabaseClient | undefined;

export function createBrowserSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    const { url, publishableKey } = getSupabasePublicEnv();
    browserClient = createBrowserClient(url, publishableKey);
  }

  return browserClient;
}
