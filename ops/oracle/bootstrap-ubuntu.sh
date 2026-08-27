#!/usr/bin/env bash
set -euo pipefail

session_check_only=0
if [[ "${1:-}" == "--verify-session" ]]; then
  session_check_only=1
  shift
fi

if [[ ${EUID} -ne 0 && "$session_check_only" != "1" ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <operator-ipv4/32>" >&2
  exit 1
fi

OPERATOR_CIDR="$1"

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

if [[ ! "$OPERATOR_CIDR" =~ ^(.+)/32$ ]] || ! is_ipv4 "${BASH_REMATCH[1]}"; then
  echo "Operator access must be one valid IPv4 /32 CIDR." >&2
  exit 1
fi

if [[ "$session_check_only" != "1" ]]; then
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    echo "This bootstrap script supports Ubuntu only." >&2
    exit 1
  fi
fi

if [[ -z "${SSH_CONNECTION:-}" || -z "${SUDO_USER:-}" ]]; then
  echo "Run from an already verified SSH key session using sudo." >&2
  exit 1
fi
read -r operator_session_ip _ _ _ <<< "$SSH_CONNECTION"
operator_cidr_ip="${OPERATOR_CIDR%/32}"
if ! is_ipv4 "$operator_session_ip" || [[ "$operator_session_ip" != "$operator_cidr_ip" ]]; then
  echo "SSH_CONNECTION source must exactly match the operator IPv4 /32." >&2
  exit 1
fi

operator_home="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
authorized_keys="$operator_home/.ssh/authorized_keys"
if [[ ! -s "$authorized_keys" ]] || ! ssh-keygen -lf "$authorized_keys" >/dev/null; then
  echo "A valid operator authorized_keys file is required before SSH hardening." >&2
  exit 1
fi
# Verify the logged-in public-key session before UFW or SSH hardening can alter access.
if ! journalctl --since "10 minutes ago" _COMM=sshd --no-pager | grep -Fq "Accepted publickey for $SUDO_USER from $operator_session_ip"; then
  echo "A recent public-key SSH authentication for the current operator and source is required." >&2
  exit 1
fi
if [[ "$session_check_only" == "1" ]]; then
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gpg ufw

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)'; then
  echo "Node.js >=22.13.0 is required." >&2
  exit 1
fi

install -m 0755 -d /usr/share/keyrings
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

if ! id -u pro7 >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /home/pro7 --shell /usr/sbin/nologin pro7
fi

install -d -o pro7 -g pro7 -m 0755 /opt/pro7 /opt/pro7/releases
install -d -o root -g pro7 -m 0750 /opt/pro7/shared
touch /opt/pro7/shared/production.env
chown root:pro7 /opt/pro7/shared/production.env
chmod 0640 /opt/pro7/shared/production.env

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$OPERATOR_CIDR" to any port 22 proto tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

install -d -m 0755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-pro7-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
/usr/sbin/sshd -t
systemctl reload ssh
