import assert from "node:assert/strict";
import test from "node:test";

import { parseSupabasePublicEnv } from "../lib/supabase/env";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};

test("rejects a missing public Supabase URL", () => {
  assert.throws(
    () =>
      parseSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      }),
    /NEXT_PUBLIC_SUPABASE_URL/,
  );
});

test("rejects a malformed public Supabase URL", () => {
  assert.throws(
    () => parseSupabasePublicEnv({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "not a URL" }),
    /NEXT_PUBLIC_SUPABASE_URL/,
  );
});

test("rejects a missing public Supabase publishable key", () => {
  assert.throws(
    () =>
      parseSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      }),
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
  );
});

test("returns validated public Supabase values", () => {
  assert.deepEqual(parseSupabasePublicEnv(validEnv), {
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_example",
  });
});
