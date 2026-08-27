# PRO7 Cloudflare Workers Free operations

This runbook publishes the existing Vinext application without changing its UI,
Supabase data, or the existing ChatGPT Sites fallback.

## Fixed release boundary

- Worker: `pro7-team-manager`
- Public URL: `https://pro7-team-manager.hunglt28-work.workers.dev`
- Plan: Workers Free only
- Compatibility date: `2026-08-27`
- Compatibility flag: `nodejs_compat`
- Compressed upload limit: 3 MiB
- Bindings: none (no D1, R2, KV, Durable Objects, Queues, AI, Hyperdrive, or Containers)

The release scripts fail closed if the generated Worker differs from this
boundary. `.openai/hosting.json` and the existing Sites deployment remain the
fallback and must not be removed.

## Authenticate and deploy

Use the pinned local Wrangler. Authenticate interactively without copying OAuth
tokens into the repository:

```bash
npx wrangler whoami
npx wrangler login
```

The ignored `.env.local` must contain exactly these names:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Never use a service-role key or `sb_secret_` key. Export the approved Cloudflare
account ID in the current shell, then run the guarded deployment:

```bash
export CLOUDFLARE_ACCOUNT_ID='<approved-account-id>'
CLOUDFLARE_DEPLOY_CONFIRM='pro7-team-manager' npm run cloudflare:deploy
```

The command builds, validates the generated config and bundle, runs a Wrangler
dry-run, enforces the Free upload limit, and only then uploads the Worker.

## Post-deploy checkpoint

Before changing Supabase, verify `/login` and `/` over HTTPS at the exact Worker
URL. Then add only that exact origin to Supabase Auth redirects and the Edge
Function `ALLOWED_ORIGINS` set while retaining localhost and the existing
`chatgpt.site` origin. Do not use wildcard origins.

Run public Admin and Member route/RBAC checks at desktop and 390 px. Confirm the
Cloudflare dashboard still shows Workers Free, no paid binding, and no recurring
CPU-limit errors.

## Rollback

If the Worker is unhealthy, restore the previous Worker deployment from
Cloudflare version history. If Supabase origin changes caused the failure,
restore the previous Auth Site URL and exact localhost plus `chatgpt.site` Edge
origin set. Keep the Worker for diagnosis; do not enable a paid plan. The existing
Sites URL remains the recovery target.
