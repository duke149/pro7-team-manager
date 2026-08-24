import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { getSupabasePublicEnv } from "./env";

let browserClient: SupabaseClient<Database> | undefined;

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const { url, publishableKey } = getSupabasePublicEnv();
    browserClient = createBrowserClient<Database>(url, publishableKey);
  }

  return browserClient;
}
