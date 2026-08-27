# PRO7 Cloudflare Workers Free Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the current PRO7 Vinext application as `pro7-team-manager.hunglt28-work.workers.dev` on Cloudflare Workers Free while preserving the existing frontend, live Supabase data, and fallback Sites deployment.

**Architecture:** Keep Vinext and both existing Vite plugins. Add an exact production Worker identity and a fail-closed build verifier around Vinext's generated `dist/server/wrangler.json`; deploy that generated Worker through the pinned local Wrangler after OAuth authentication. Add the exact healthy Worker origin to Supabase Auth and Edge Function CORS only after deployment, then verify Admin and Member behavior publicly.

**Tech Stack:** Vinext 1.0.0-beta.2, Vite 8.0.13, `@cloudflare/vite-plugin` 1.37.1, Wrangler 4.92.0, Cloudflare Workers Free, Supabase Auth/PostgREST/Storage/Edge Functions, Node.js >=22.13.0.

**Spec:** `docs/superpowers/specs/2026-08-27-pro7-cloudflare-workers-hosting-design.md`

## Global Constraints

- Cloudflare account must remain on Workers Free (`$0`); never press Upgrade or enable a paid binding/service.
- Worker name is exactly `pro7-team-manager`; initial origin is exactly `https://pro7-team-manager.hunglt28-work.workers.dev`.
- Worker compressed upload must be at most 3 MiB and declare no D1, R2, KV, Durable Object, Queue, AI, Hyperdrive, Container, custom-domain, or paid binding.
- Worker compatibility flag remains `nodejs_compat`; compatibility date is pinned to `2026-08-27`.
- Keep `.openai/hosting.json`, the `sites()` plugin, and the existing `chatgpt.site` deployment unchanged.
- Use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never print, commit, or upload a service-role/secret key.
- Do not change frontend components, CSS, database schema, production seed data, RLS, roles, or account credentials.
- Add the Worker origin to Supabase only after the Worker returns a healthy HTTPS response.
- Retain localhost and the existing `chatgpt.site` origins in Supabase Auth and Edge `ALLOWED_ORIGINS`; no wildcard origins.
- If Cloudflare rejects the bundle, consistently exceeds the Free CPU ceiling, or requires Workers Paid, stop and preserve the fallback deployment.
- Preserve untracked `.agents/skills/` and `supabase/.temp/`.

---

### Task 1: Add a fail-closed Cloudflare Worker release contract

**Files:**
- Create: `scripts/cloudflare-build-contract.mjs`
- Create: `scripts/verify-cloudflare-build.mjs`
- Create: `scripts/deploy-cloudflare-worker.sh`
- Create: `ops/cloudflare/README.md`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Test: `tests/cloudflare-hosting-contract.test.mjs`

**Interfaces:**
- Consumes: Vinext-generated `dist/server/wrangler.json`, `dist/server/**/*`, `dist/client/**/*`, ignored `.env.local`, authenticated local Wrangler state, `CLOUDFLARE_ACCOUNT_ID`.
- Produces: `validateWorkerConfig(config): string[]`, `scanServerBundle(rootDir): Promise<string[]>`, `parseWranglerDryRun(output): { gzipBytes: number }`, `npm run cloudflare:verify`, and `npm run cloudflare:deploy`.

- [ ] **Step 1: Write the failing hosting contract tests**

Create `tests/cloudflare-hosting-contract.test.mjs` with fixture-driven tests that import `scripts/cloudflare-build-contract.mjs` and assert:

```js
const validConfig = {
  name: "pro7-team-manager",
  main: "index.js",
  compatibility_date: "2026-08-27",
  compatibility_flags: ["nodejs_compat"],
  no_bundle: true,
  assets: { directory: "../client" },
  d1_databases: [],
  r2_buckets: [],
  kv_namespaces: [],
  durable_objects: { bindings: [] },
  queues: { producers: [], consumers: [] },
  services: [],
  hyperdrive: [],
};

assert.deepEqual(validateWorkerConfig(validConfig), []);
assert.match(validateWorkerConfig({ ...validConfig, name: "wrong" }).join("\n"), /worker name/i);
assert.match(validateWorkerConfig({ ...validConfig, d1_databases: [{ binding: "DB" }] }).join("\n"), /d1/i);
assert.equal(parseWranglerDryRun("Total Upload: 1.0 MiB / gzip: 2.99 MiB").gzipBytes, 3135242);
assert.throws(() => parseWranglerDryRun("Total Upload: 1.0 MiB / gzip: 3.01 MiB"), /3 MiB/i);
```

Add temporary-directory bundle tests proving `scanServerBundle` rejects `sb_secret_`, a JWT payload with `role: "service_role"`, and accepts the existing public Supabase URL/publishable-key shape.

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```bash
node --test tests/cloudflare-hosting-contract.test.mjs
```

Expected: FAIL because `scripts/cloudflare-build-contract.mjs` does not exist.

- [ ] **Step 3: Implement the pure contract module**

Create `scripts/cloudflare-build-contract.mjs` exporting:

```js
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export const WORKER_NAME = "pro7-team-manager";
export const COMPATIBILITY_DATE = "2026-08-27";
export const MAX_GZIP_BYTES = 3 * 1024 * 1024;

export function validateWorkerConfig(config) {
  const errors = [];
  if (config.name !== WORKER_NAME) errors.push("Worker name must be pro7-team-manager");
  if (config.main !== "index.js") errors.push("Worker main must be index.js");
  if (config.compatibility_date !== COMPATIBILITY_DATE) errors.push("Compatibility date mismatch");
  if (!config.compatibility_flags?.includes("nodejs_compat")) errors.push("nodejs_compat is required");
  if (config.no_bundle !== true) errors.push("Generated Worker must use no_bundle");
  if (config.assets?.directory !== "../client") errors.push("Static asset directory mismatch");
  for (const key of ["d1_databases", "r2_buckets", "kv_namespaces", "services", "hyperdrive"]) {
    if (!Array.isArray(config[key]) || config[key].length !== 0) errors.push(`${key} must be empty`);
  }
  if ((config.durable_objects?.bindings ?? []).length !== 0) errors.push("Durable Object bindings must be empty");
  if ((config.queues?.producers ?? []).length !== 0 || (config.queues?.consumers ?? []).length !== 0) {
    errors.push("Queue bindings must be empty");
  }
  if ((config.routes ?? []).length !== 0) errors.push("Custom routes are forbidden for workers.dev release");
  return errors;
}

async function* walkTextFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTextFiles(path);
    else if (/\.(?:js|mjs|json)$/.test(entry.name)) yield path;
  }
}

export async function scanServerBundle(rootDir) {
  const errors = [];
  for await (const path of walkTextFiles(rootDir)) {
    const text = await readFile(path, "utf8");
    if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) errors.push(`${relative(rootDir, path)} contains a secret key`);
    for (const token of text.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
      try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
        if (payload.role === "service_role") errors.push(`${relative(rootDir, path)} contains a service-role JWT`);
      } catch {}
    }
  }
  return errors;
}

export function parseWranglerDryRun(output) {
  const match = output.match(/gzip:\s*([0-9.]+)\s*(KiB|MiB)/i);
  if (!match) throw new Error("Wrangler dry-run gzip size was not found");
  const gzipBytes = Math.round(Number(match[1]) * (match[2].toLowerCase() === "mib" ? 1024 ** 2 : 1024));
  if (gzipBytes > MAX_GZIP_BYTES) throw new Error("Worker gzip size exceeds the 3 MiB Free limit");
  return { gzipBytes };
}
```

Validation must require the exact name/date/flag/main/assets/no-bundle fields, reject missing or non-empty paid/resource bindings, reject custom routes, and reject an absent static asset directory. Bundle scanning returns file-relative errors without echoing matched secret text.

- [ ] **Step 4: Implement the generated-build verifier**

Create `scripts/verify-cloudflare-build.mjs` that:

1. Reads `dist/server/wrangler.json`.
2. Calls `validateWorkerConfig`.
3. Confirms `dist/server/index.js` and `dist/client/` exist.
4. Calls `scanServerBundle("dist/server")`.
5. Optionally reads `--wrangler-output <path>` and calls `parseWranglerDryRun`.
6. Prints only a stable success line with Worker name and gzip byte count; never prints environment values or bundle matches.
7. Exits non-zero with redacted validation messages on failure.

- [ ] **Step 5: Pin the Worker identity in Vite config**

Modify `vite.config.ts` so `localBindingConfig` adds:

```ts
name: "pro7-team-manager",
compatibility_date: "2026-08-27",
```

Keep `main`, `nodejs_compat`, the optional Sites-owned D1/R2 declarations, `vinext()`, `sites()`, and `cloudflare(...)` otherwise intact.

- [ ] **Step 6: Add the guarded deploy script**

Create executable `scripts/deploy-cloudflare-worker.sh` with `set -euo pipefail`. It must:

1. Require Node >=22.13 and `CLOUDFLARE_ACCOUNT_ID` matching `^[0-9a-f]{32}$`.
2. Require `CLOUDFLARE_DEPLOY_CONFIRM=pro7-team-manager` before remote upload.
3. Verify `.env.local` exists, contains exactly the two supported public variable names, and contains neither `service_role` nor `sb_secret_`; never source or print the file.
4. Run `npm run build`.
5. Run `node scripts/verify-cloudflare-build.mjs`.
6. Capture `npx wrangler deploy --dry-run --config dist/server/wrangler.json` output in a mode-600 temporary file while still showing safe Wrangler size output.
7. Run the verifier with `--wrangler-output`.
8. Run `npx wrangler deploy --config dist/server/wrangler.json` only after all gates pass.
9. Remove the temporary dry-run file through a trap.

- [ ] **Step 7: Add package scripts and operator runbook**

Add:

```json
"cloudflare:verify": "node scripts/verify-cloudflare-build.mjs",
"cloudflare:deploy": "bash scripts/deploy-cloudflare-worker.sh"
```

Create `ops/cloudflare/README.md` documenting Free-plan limits, OAuth login, required environment names, exact deploy command, expected Worker URL, Supabase post-deploy checkpoint, public verification, and rollback without including account IDs, keys, passwords, or tokens.

- [ ] **Step 8: Run GREEN and build verification**

Run:

```bash
node --test tests/cloudflare-hosting-contract.test.mjs
npm run build
npm run cloudflare:verify
npx eslint vite.config.ts tests/cloudflare-hosting-contract.test.mjs scripts/verify-cloudflare-build.mjs scripts/cloudflare-build-contract.mjs
git diff --check
```

Expected: all focused tests and checks pass; verifier prints the exact Worker name and no secrets.

- [ ] **Step 9: Run the full regression suite**

Run:

```bash
npm run test:unit
npm test
```

Expected: no new failures; only existing environment-gated database skips are allowed.

- [ ] **Step 10: Commit Task 1**

```bash
git add vite.config.ts package.json package-lock.json \
  scripts/cloudflare-build-contract.mjs scripts/verify-cloudflare-build.mjs \
  scripts/deploy-cloudflare-worker.sh ops/cloudflare/README.md \
  tests/cloudflare-hosting-contract.test.mjs
git commit -m "feat: add Cloudflare Workers Free release gates"
```

---

### Task 2: Authenticate Wrangler and deploy the exact Free Worker

**Files:**
- Create ignored handoff: `.superpowers/sdd/2026-08-27-pro7-cloudflare-workers-hosting/task-2-cloudflare-state.md`
- Modify ignored ledger: `.superpowers/sdd/2026-08-27-pro7-cloudflare-workers-hosting/progress.md`

**Interfaces:**
- Consumes: Task 1 release scripts, user-approved Cloudflare account, browser session, ignored `.env.local`.
- Produces: one Worker named `pro7-team-manager`, deployment version ID, exact public `workers.dev` URL, and rollback metadata recorded outside Git.

- [ ] **Step 1: Verify the isolated workspace and baseline**

Run the worktree detection commands from `superpowers:using-git-worktrees`. Confirm the branch is not `main`/`master`, the worktree is linked, and only preserved untracked directories remain. Run the focused Task 1 suite once more.

- [ ] **Step 2: Perform read-only Cloudflare preflight**

In the dashboard verify:

- Workers Free is Current plan;
- request usage is zero or within Free quota;
- no existing project named `pro7-team-manager`;
- account subdomain is `hunglt28-work.workers.dev`.

Record only these non-secret facts in the ignored Task 2 handoff.

- [ ] **Step 3: Authenticate the pinned local Wrangler**

Run:

```bash
npx wrangler whoami
```

If unauthenticated, run `npx wrangler login`, open the generated Cloudflare OAuth URL in the existing browser, and pause for the user's action-time approval before authorizing Wrangler. Re-run `whoami` and confirm the approved account without printing OAuth tokens.

- [ ] **Step 4: Execute dry-run without remote upload**

Export `CLOUDFLARE_ACCOUNT_ID` in the command environment without committing it. Run the exact internal dry-run steps from `scripts/deploy-cloudflare-worker.sh` without `CLOUDFLARE_DEPLOY_CONFIRM`. Expected: the script refuses the remote step while build/config/secret/bundle checks remain inspectable separately.

Run the verifier against Wrangler dry-run output and record:

- generated Worker name;
- gzip byte count;
- compatibility date/flag;
- absence of paid bindings;
- static asset count.

Stop if gzip exceeds 3 MiB or Cloudflare indicates Workers Paid is required.

- [ ] **Step 5: Deploy exactly once**

Run:

```bash
test -n "${CLOUDFLARE_ACCOUNT_ID:-}"
CLOUDFLARE_DEPLOY_CONFIRM='pro7-team-manager' \
npm run cloudflare:deploy
```

Do not echo the account value or environment contents. Capture the deployment version and URL in the ignored handoff. Retry only for an explicit transient Cloudflare error; stop for quota, validation, plan, or permission failures.

- [ ] **Step 6: Verify the public Worker before Supabase mutation**

Run HTTPS checks against:

```text
https://pro7-team-manager.hunglt28-work.workers.dev/login
https://pro7-team-manager.hunglt28-work.workers.dev/
```

Require TLS success, no Cloudflare 1101/1102/1027 error, login HTML, CSS/font assets, and current root redirect behavior. Check Cloudflare dashboard shows one Free Worker and no paid subscription.

- [ ] **Step 7: Update the ignored ledger checkpoint**

Record the deployment status, exact public origin, version ID, gzip size, Free plan evidence, and whether the CPU ceiling is healthy. Do not record credentials or publishable-key contents.

---

### Task 3: Authorize the exact Worker origin in Supabase

**Files:**
- Create ignored handoff: `.superpowers/sdd/2026-08-27-pro7-cloudflare-workers-hosting/task-3-supabase-origin.md`
- Modify ignored ledger: `.superpowers/sdd/2026-08-27-pro7-cloudflare-workers-hosting/progress.md`

**Interfaces:**
- Consumes: healthy Worker origin from Task 2, project `pficsujapinkmqsyvcfw`, existing localhost and `chatgpt.site` origins.
- Produces: exact Auth redirect allowlist and exact Edge Function `ALLOWED_ORIGINS` set containing the new Worker origin.

- [ ] **Step 1: Read-only Supabase preflight**

Use the Supabase connector/CLI to confirm project health, deployed functions, current Auth redirect configuration, current Edge secret names, and that no schema migration is pending for this hosting task. Redact key values.

- [ ] **Step 2: Define the exact origin set**

Use exactly:

```text
http://localhost:3000
https://pro7-team-manager.duke149-work.chatgpt.site
https://pro7-team-manager.hunglt28-work.workers.dev
```

Reject wildcard, trailing-slash, suffix, HTTP Worker, preview Worker, and arbitrary `workers.dev` origins.

- [ ] **Step 3: Update Supabase Auth URLs**

In the authenticated Supabase dashboard set the Worker origin as Site URL and retain explicit redirect destinations for localhost and the existing `chatgpt.site` origin, including `/auth/callback` and `/account/reset-password` destinations used by the application. Read the final displayed configuration back before leaving the page.

- [ ] **Step 4: Update the Edge Function origin secret**

Inspect `npx supabase secrets set --help`, then set project-wide `ALLOWED_ORIGINS` to the exact comma-separated origin set. Do not redeploy functions unless the checked-in function code hash differs from the deployed hash. Confirm only the secret name/status, not its value.

- [ ] **Step 5: Verify CORS and recovery callbacks**

Send OPTIONS requests to both JWT-protected functions with the exact Worker origin and require the expected allow-origin response. Send requests from `https://pro7-team-manager.hunglt28-work.workers.dev.evil.test` and an unrelated `workers.dev` origin and require denial.

Verify password-recovery and login callback URLs remain on the exact Worker hostname and cannot redirect to a suffix-confusable host.

- [ ] **Step 6: Record the remote configuration checkpoint**

Write exact origin names, verification timestamps, function names, and redacted evidence to the ignored handoff. Record explicitly that no Supabase schema/data mutation occurred.

---

### Task 4: Run public Admin and Member acceptance tests

**Files:**
- Create ignored report: `.superpowers/sdd/2026-08-27-pro7-cloudflare-workers-hosting/task-4-public-qa.md`
- Modify ignored ledger: `.superpowers/sdd/2026-08-27-pro7-cloudflare-workers-hosting/progress.md`

**Interfaces:**
- Consumes: public Worker origin, existing approved Admin and Member test accounts, live `nat-fc` data.
- Produces: browser evidence for public auth, routing, RBAC, responsive behavior, RSVP visibility, and rollback readiness.

- [ ] **Step 1: Verify unauthenticated behavior**

Open the exact Worker URL in the in-app browser. Verify `/login`, show-password, forgot-password, root redirect, favicon/font/CSS, and no console/network Worker resource errors. Do not save passwords in the browser.

- [ ] **Step 2: Verify the Admin route matrix**

Sign in with one existing approved Admin account without printing credentials. Verify:

```text
/teams/nat-fc/overview
/teams/nat-fc/squad
/teams/nat-fc/matches
/teams/nat-fc/tactics
/teams/nat-fc/funds
/teams/nat-fc/admin/settings
/account/profile
```

Confirm current data renders from Supabase, Funds is visible, Admin settings are accessible, and desktop/mobile navigation matches the existing local UI.

- [ ] **Step 3: Perform one reversible Admin/Member workflow**

Use an existing scheduled match invitation when available. Capture the Member's original attendance status, change it through the Member UI, verify the Admin attendance count/status reflects it, then restore the original status through the same authoritative UI/API path. Do not create/delete a match, player, fund entry, account, or team merely for hosting QA.

If no reversible invitation exists, record the gap and limit this task to read-only route/RBAC verification rather than mutating production data.

- [ ] **Step 4: Verify the Member route matrix and denial boundaries**

Sign out and sign in with one existing Member account. Verify overview, squad, matches, tactics, notifications, and self-profile. Confirm Funds and Admin Settings are absent from navigation and return the intended denial/redirect state when addressed directly. Confirm Member cannot edit another player.

- [ ] **Step 5: Verify responsive layouts**

At desktop and 390 px widths, inspect representative Admin and Member overview/squad/matches/tactics pages. Confirm no horizontal overflow, clipped modal, hidden primary action, or bottom-navigation misalignment; Admin's extra Funds item and Member's reduced item set must both align.

- [ ] **Step 6: Check Cloudflare runtime health**

Read Worker logs/metrics after QA. Require no consistent error 1102 CPU-limit pattern, no error 1027 quota response, and no unexpected paid usage. Record request count, CPU observations, and any cold-start limitation without exposing headers/cookies.

- [ ] **Step 7: Record QA evidence**

Write route/status/viewport evidence and the reversible workflow before/after values to the ignored report. Do not include passwords, cookies, JWTs, publishable-key contents, or personal profile fields beyond display names already visible in the product.

---

### Task 5: Final verification and hosting handoff

**Files:**
- Modify: `ops/cloudflare/README.md` only if runtime evidence revealed a missing operational step
- Modify ignored ledger: `.superpowers/sdd/2026-08-27-pro7-cloudflare-workers-hosting/progress.md`

**Interfaces:**
- Consumes: Tasks 1-4 implementation, deployment, Supabase config, and QA evidence.
- Produces: verified public URL, rollback instructions, clean Git checkpoint, and branch-completion options.

- [ ] **Step 1: Run fresh repository verification**

Run:

```bash
node --test tests/cloudflare-hosting-contract.test.mjs
npm run test:unit
npm test
npx eslint vite.config.ts tests/cloudflare-hosting-contract.test.mjs scripts/verify-cloudflare-build.mjs scripts/cloudflare-build-contract.mjs
git diff --check
git status --short
```

Expected: all new tests pass; full tests/build have no new failure; only preserved untracked directories remain.

- [ ] **Step 2: Re-run the exact public smoke checks**

From a fresh unauthenticated request and authenticated Admin/Member browser sessions, confirm HTTPS, login, routing, Supabase data, CORS, and RBAC still pass after all configuration changes. Confirm the existing `https://pro7-team-manager.duke149-work.chatgpt.site` fallback remains reachable.

If a Worker check fails after Task 3 changed Supabase, restore the previous Auth Site URL and restore `ALLOWED_ORIGINS` to the exact localhost plus `chatgpt.site` set. Verify the fallback again, record the rollback, and stop without deleting the Worker or enabling a paid plan.

- [ ] **Step 3: Confirm no-cost state**

Read Cloudflare Workers Plans and Worker usage pages. Require Current plan = Free, no paid subscription, no paid binding, and no unexpected resource. Confirm Oracle still has no instance/volume/VCN created by the abandoned path.

- [ ] **Step 4: Complete the ignored ledger**

Record commits, test counts, bundle size, Worker deployment version, exact public origin, Supabase origin state, QA verdict, known Free CPU risk, rollback target, and preserved fallback deployment.

- [ ] **Step 5: Commit any final tracked runbook correction**

If Task 5 changed `ops/cloudflare/README.md`:

```bash
git add ops/cloudflare/README.md
git commit -m "docs: finalize Cloudflare Worker operations"
```

Otherwise do not create an empty commit.

- [ ] **Step 6: Finish the development branch**

Invoke `superpowers:finishing-a-development-branch`, rerun its required verification, and present the integration options. Do not merge, delete the worktree, or remove the Worker without the user's explicit choice.
