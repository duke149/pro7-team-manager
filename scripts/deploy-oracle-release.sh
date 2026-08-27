#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --ip <public-ipv4> --key <private-key> --env-file <production-env> --archive <release.tar.gz>" >&2
}

is_ipv4() {
  local address="$1"
  local octet
  local -a octets

  [[ "$address" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  IFS='.' read -r -a octets <<< "$address"
  for octet in "${octets[@]}"; do
    (( 10#$octet <= 255 )) || return 1
  done
}

is_public_ipv4() {
  local address="$1"
  local first_octet
  local second_octet
  local third_octet
  local -a octets

  is_ipv4 "$address" || return 1
  IFS='.' read -r -a octets <<< "$address"
  first_octet=$((10#${octets[0]}))
  second_octet=$((10#${octets[1]}))
  third_octet=$((10#${octets[2]}))
  (( first_octet > 0 && first_octet < 224 )) || return 1
  (( first_octet != 10 && first_octet != 127 )) || return 1
  (( !(first_octet == 100 && second_octet >= 64 && second_octet <= 127) )) || return 1
  (( !(first_octet == 169 && second_octet == 254) )) || return 1
  (( !(first_octet == 172 && second_octet >= 16 && second_octet <= 31) )) || return 1
  (( !(first_octet == 192 && second_octet == 0 && (third_octet == 0 || third_octet == 2)) )) || return 1
  (( !(first_octet == 192 && second_octet == 88 && third_octet == 99) )) || return 1
  (( !(first_octet == 192 && second_octet == 168) )) || return 1
  (( !(first_octet == 198 && (second_octet == 18 || second_octet == 19 || (second_octet == 51 && third_octet == 100)) )) ) || return 1
  (( !(first_octet == 203 && second_octet == 0 && third_octet == 113) )) || return 1
}

file_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

ip_address=""
key_file=""
environment_file=""
archive_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)
      ip_address="${2:-}"
      shift 2
      ;;
    --key)
      key_file="${2:-}"
      shift 2
      ;;
    --env-file)
      environment_file="${2:-}"
      shift 2
      ;;
    --archive)
      archive_file="${2:-}"
      shift 2
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

if ! is_public_ipv4 "$ip_address"; then
  echo "--ip must be a valid public IPv4 address." >&2
  exit 1
fi

if [[ ! -f "$key_file" ]] || [[ "$(file_mode "$key_file")" != "600" ]]; then
  echo "--key must name a private-key file with mode 600." >&2
  exit 1
fi

if [[ ! -f "$environment_file" ]] || [[ "$(file_mode "$environment_file")" != "600" ]]; then
  echo "--env-file must name a production environment file with mode 600." >&2
  exit 1
fi

if ! awk -F= '
  $1 == "NEXT_PUBLIC_SUPABASE_URL" {
    matches += 1
    valid = NF == 2 && $2 == "https://pficsujapinkmqsyvcfw.supabase.co"
  }
  END { exit !(matches == 1 && valid) }
' "$environment_file"; then
  echo "NEXT_PUBLIC_SUPABASE_URL must be https://pficsujapinkmqsyvcfw.supabase.co." >&2
  exit 1
fi

if ! awk -F= '
  BEGIN { valid = 1 }
  $1 == "NODE_ENV" && NF == 2 && $2 == "production" { node_environment += 1; next }
  $1 == "NEXT_PUBLIC_SUPABASE_URL" && NF == 2 && $2 == "https://pficsujapinkmqsyvcfw.supabase.co" { supabase_url += 1; next }
  $1 == "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" && NF == 2 && length($2) { publishable_key += 1; next }
  { valid = 0 }
  END { exit !(valid != 0 && node_environment == 1 && supabase_url == 1 && publishable_key == 1) }
' "$environment_file"; then
  echo "--env-file must contain only the three required production variables." >&2
  exit 1
fi

publishable_key="$(awk -F= '$1 == "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" { print $2 }' "$environment_file")"
if ! NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" node - <<'NODE'
const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) {
  process.exit(0);
}
const segments = value.split(".");
if (segments.length !== 3 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
  process.exit(1);
}
if (segments.some((segment) => segment.length % 4 === 1)) {
  process.exit(1);
}
try {
  const decode = (segment) => JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  const header = decode(segments[0]);
  const payload = decode(segments[1]);
  Buffer.from(segments[2], "base64url");
  process.exit(header?.alg === "HS256" && payload?.role === "anon" ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
then
  echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key or a legacy anon key." >&2
  exit 1
fi

if [[ ! -f "$archive_file" ]] || ! tar -tzf "$archive_file" >/dev/null; then
  echo "--archive must be a readable gzip tar archive." >&2
  exit 1
fi

if tar -tzf "$archive_file" | grep -Eq '(^|/)\.env\.local$'; then
  echo "Release archive must not contain .env.local." >&2
  exit 1
fi

if tar -tzf "$archive_file" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Release archive contains an unsafe path." >&2
  exit 1
fi

release_sha="$(basename "$archive_file" | sed -nE 's/^pro7-([0-9a-f]{40})\.tar\.gz$/\1/p')"
if [[ -z "$release_sha" ]]; then
  echo "--archive must use the pro7-<40-character-git-sha>.tar.gz filename." >&2
  exit 1
fi

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(git -C "$script_directory/.." rev-parse --show-toplevel)"
current_sha="$(git -C "$repository_root" rev-parse HEAD)"
if [[ "$release_sha" != "$current_sha" ]]; then
  echo "--archive Git SHA must equal current Git HEAD." >&2
  exit 1
fi
if ! git -C "$repository_root" rev-parse --verify --quiet "$release_sha^{commit}" >/dev/null; then
  echo "--archive Git SHA is not available in this repository." >&2
  exit 1
fi
expected_archive="$(mktemp)"
if ! git -C "$repository_root" archive --format=tar "$release_sha" | gzip -n > "$expected_archive"; then
  rm -f "$expected_archive"
  echo "Unable to reproduce the requested Git archive." >&2
  exit 1
fi
if ! cmp -s "$expected_archive" "$archive_file"; then
  rm -f "$expected_archive"
  echo "--archive must exactly match git archive for its Git SHA." >&2
  exit 1
fi
rm -f "$expected_archive"
if ! git -C "$repository_root" diff --quiet HEAD; then
  echo "Refusing to deploy from a dirty tracked Git HEAD." >&2
  exit 1
fi

service_file="$script_directory/../ops/oracle/pro7.service"
caddy_template="$script_directory/../ops/oracle/Caddyfile.template"
if [[ ! -f "$service_file" || ! -f "$caddy_template" ]]; then
  echo "Required Oracle host assets are missing." >&2
  exit 1
fi

hostname="${ip_address}.sslip.io"
remote_directory="/tmp/pro7-deploy-$release_sha"
remote_archive="$remote_directory/release.tar.gz"
remote_environment="$remote_directory/production.env"
remote_service="$remote_directory/pro7.service"
remote_caddy_template="$remote_directory/Caddyfile.template"
local_environment_directory="$(mktemp -d)"
chmod 700 "$local_environment_directory"
local_environment_copy="$local_environment_directory/production.env"
install -m 600 "$environment_file" "$local_environment_copy"

cleanup() {
  rm -f "$local_environment_copy"
  rmdir "$local_environment_directory" 2>/dev/null || true
  ssh -i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes "ubuntu@$ip_address" "rm -rf '$remote_directory'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ssh -i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes "ubuntu@$ip_address" "umask 077 && mkdir '$remote_directory' && chmod 700 '$remote_directory'"
scp -i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes "$archive_file" "ubuntu@$ip_address:$remote_archive"
scp -i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes "$local_environment_copy" "ubuntu@$ip_address:$remote_environment"
scp -i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes "$service_file" "ubuntu@$ip_address:$remote_service"
scp -i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes "$caddy_template" "ubuntu@$ip_address:$remote_caddy_template"
ssh -i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes "ubuntu@$ip_address" "chmod 600 '$remote_environment'"

ssh -i "$key_file" -o IdentitiesOnly=yes -o BatchMode=yes "ubuntu@$ip_address" \
  'bash -s --' "$release_sha" "$remote_directory" "$hostname" <<'REMOTE_DEPLOY'
set -euo pipefail

release_sha="$1"
staging_directory="$2"
hostname="$3"
release_id="$(date -u +%Y%m%d%H%M%S)-$release_sha"
release_directory="/opt/pro7/releases/$release_id"
previous_release="$(sudo readlink -f /opt/pro7/current 2>/dev/null || true)"

rollback() {
  if [[ -n "$previous_release" ]]; then
    sudo ln -sfn "$previous_release" /opt/pro7/current
    sudo systemctl restart pro7
  else
    sudo systemctl stop pro7 || true
    sudo rm -f /opt/pro7/current
  fi
}

sudo install -o root -g pro7 -m 0640 "$staging_directory/production.env" /opt/pro7/shared/production.env
sudo install -m 0644 "$staging_directory/pro7.service" /etc/systemd/system/pro7.service

rendered_caddy="$staging_directory/Caddyfile"
sed "s/{\\\$PRO7_HOSTNAME}/$hostname/g" "$staging_directory/Caddyfile.template" > "$rendered_caddy"
sudo caddy validate --config "$rendered_caddy" --adapter caddyfile

sudo install -d -o pro7 -g pro7 -m 0755 "$release_directory"
sudo tar -xzf "$staging_directory/release.tar.gz" -C "$release_directory"
sudo chown -R pro7:pro7 "$release_directory"

sudo -u pro7 env RELEASE_DIRECTORY="$release_directory" bash -s <<'BUILD_RELEASE'
set -euo pipefail
read_environment_value() {
  awk -F= -v name="$1" '$1 == name { print substr($0, length(name) + 2) }' /opt/pro7/shared/production.env
}
node_environment="$(read_environment_value NODE_ENV)"
supabase_url="$(read_environment_value NEXT_PUBLIC_SUPABASE_URL)"
publishable_key="$(read_environment_value NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
if [[ "$node_environment" != "production" || "$supabase_url" != "https://pficsujapinkmqsyvcfw.supabase.co" ]]; then
  exit 1
fi
cd "$RELEASE_DIRECTORY"
env -i HOME=/home/pro7 PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV="$node_environment" NEXT_PUBLIC_SUPABASE_URL="$supabase_url" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" npm ci
env -i HOME=/home/pro7 PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV="$node_environment" NEXT_PUBLIC_SUPABASE_URL="$supabase_url" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" npm run build
BUILD_RELEASE

sudo -u pro7 env RELEASE_DIRECTORY="$release_directory" bash -s <<'PROBE_RELEASE'
set -euo pipefail
cd "$RELEASE_DIRECTORY"
npm run start -- --host 127.0.0.1 --port 3001 >/tmp/pro7-release-probe.log 2>&1 &
probe_pid=$!
trap 'kill "$probe_pid" >/dev/null 2>&1 || true; wait "$probe_pid" >/dev/null 2>&1 || true' EXIT
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:3001/ >/dev/null; then
    exit 0
  fi
  sleep 1
done
exit 1
PROBE_RELEASE

sudo ln -sfn "$release_directory" /opt/pro7/current
sudo systemctl daemon-reload
sudo systemctl enable pro7
sudo systemctl restart pro7

ready=0
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  rollback
  exit 1
fi

sudo install -m 0644 "$rendered_caddy" /etc/caddy/Caddyfile
if ! sudo systemctl reload caddy; then
  rollback
  exit 1
fi

for attempt in {1..30}; do
  if curl -fsS --connect-timeout 5 "https://$hostname/" >/dev/null; then
    exit 0
  fi
  sleep 2
done

rollback
exit 1
REMOTE_DEPLOY
