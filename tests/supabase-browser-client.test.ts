import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { build } from "vite";

import { createBrowserSupabaseClient } from "../lib/supabase/client";

const url = "https://bundle-test.supabase.co";
const publishableKey = "sb_publishable_bundle_test_key";

test("browser client receives public credentials injected into its bundle", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;

  try {
    const client = createBrowserSupabaseClient();
    assert.equal(client.supabaseUrl, url);

    const result = await build({
      configFile: false,
      define: {
        "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(url),
        "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
          publishableKey,
        ),
      },
      build: {
        lib: {
          entry: resolve("lib/supabase/client.ts"),
          formats: ["es"],
          fileName: "supabase-client",
        },
        write: false,
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(
      (bundle) => bundle.output,
    );
    const bundledCode = outputs
      .filter((output) => output.type === "chunk")
      .map((output) => output.code)
      .join("\n");

    assert.ok(bundledCode.includes(url));
    assert.ok(bundledCode.includes(publishableKey));
  } finally {
    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }
    if (previousKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
    }
  }
});
