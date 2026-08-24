import assert from "node:assert/strict";
import test from "node:test";

import { parseSupabasePublicEnv } from "../lib/supabase/env";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};

const legacyAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl";
const legacyServiceRoleKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl";

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

test("rejects non-HTTPS project URLs outside loopback development hosts", () => {
  for (const url of [
    "http://project.supabase.co",
    "http://192.168.1.10:54321",
    "ftp://project.supabase.co",
  ]) {
    assert.throws(
      () => parseSupabasePublicEnv({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: url }),
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  }
});

test("accepts HTTP only for explicit loopback development hosts", () => {
  for (const url of [
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://127.1.2.3:54321",
    "http://[::1]:54321",
  ]) {
    assert.equal(
      parseSupabasePublicEnv({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: url }).url,
      url,
    );
  }
});

test("rejects project URLs containing credentials, query parameters, or fragments", () => {
  for (const url of [
    "https://user:password@project.supabase.co",
    "https://project.supabase.co?apikey=public",
    "https://project.supabase.co#fragment",
  ]) {
    assert.throws(
      () => parseSupabasePublicEnv({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: url }),
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  }
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

test("rejects elevated, malformed, and unknown public Supabase key forms", () => {
  for (const publishableKey of [
    "sb_secret_backend-only",
    legacyServiceRoleKey,
    "header.not-base64.signature",
    "bm90LWpzb24.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl",
    "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.not+base64url",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.a",
    "eyJyb2xlIjoiYW5vbiJ9",
    "unknown_public_key",
  ]) {
    assert.throws(
      () =>
        parseSupabasePublicEnv({
          ...validEnv,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
        }),
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  }
});

test("accepts a decodable legacy JWT only when its role is anon", () => {
  assert.equal(
    parseSupabasePublicEnv({
      ...validEnv,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyAnonKey,
    }).publishableKey,
    legacyAnonKey,
  );
});

test("returns validated public Supabase values", () => {
  assert.deepEqual(parseSupabasePublicEnv(validEnv), {
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_example",
  });
});
