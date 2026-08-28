#!/usr/bin/env bash
set -euo pipefail

readonly worker_name='pro7-team-manager'
readonly required_node_major=22
readonly required_node_minor=13
readonly env_file='.env.local'

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

node_version="$(node -p 'process.versions.node')"
node_major="${node_version%%.*}"
node_rest="${node_version#*.}"
node_minor="${node_rest%%.*}"
if (( node_major < required_node_major || (node_major == required_node_major && node_minor < required_node_minor) )); then
  fail 'Cloudflare deployment requires Node.js >=22.13.0.'
fi

[[ "${CLOUDFLARE_ACCOUNT_ID:-}" =~ ^[0-9a-f]{32}$ ]] || \
  fail 'CLOUDFLARE_ACCOUNT_ID must be the approved 32-character lowercase account ID.'
[[ "${CLOUDFLARE_DEPLOY_CONFIRM:-}" == "$worker_name" ]] || \
  fail 'Remote upload refused: set CLOUDFLARE_DEPLOY_CONFIRM=pro7-team-manager.'
[[ -f "$env_file" ]] || fail '.env.local is required for the production build.'

env_names="$(awk -F= '
  /^[[:space:]]*(#|$)/ { next }
  {
    key=$1
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
    if (key != "") print key
  }
' "$env_file" | LC_ALL=C sort)"
expected_names=$'NEXT_PUBLIC_PRO7_VAPID_PUBLIC_KEY\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\nNEXT_PUBLIC_SUPABASE_URL'
[[ "$env_names" == "$expected_names" ]] || \
  fail '.env.local must contain exactly the three approved public variable names.'
if LC_ALL=C grep -Eiq '(service_role|sb_secret_[A-Za-z0-9_-]{20,})' "$env_file"; then
  fail '.env.local contains a forbidden elevated Supabase credential.'
fi
vapid_public_key="$(awk -F= '$1 == "NEXT_PUBLIC_PRO7_VAPID_PUBLIC_KEY" { print $2 }' "$env_file")"
[[ "$vapid_public_key" =~ ^[A-Za-z0-9_\-]{80,120}$ ]] || \
  fail 'NEXT_PUBLIC_PRO7_VAPID_PUBLIC_KEY must be an 80-120 character base64url public key.'

dry_run_file="$(mktemp "${TMPDIR:-/tmp}/pro7-cloudflare-dry-run.XXXXXX")"
chmod 600 "$dry_run_file"
trap 'rm -f "$dry_run_file"' EXIT

npm run build
node scripts/verify-cloudflare-build.mjs

if ! npx wrangler deploy --dry-run --config dist/server/wrangler.json >"$dry_run_file" 2>&1; then
  fail 'Wrangler dry-run failed; no remote upload was attempted.'
fi
node scripts/verify-cloudflare-build.mjs --wrangler-output "$dry_run_file"

npx wrangler deploy --config dist/server/wrangler.json
