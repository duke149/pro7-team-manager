# Oracle Always Free host runbook

Run every command from the repository root. Do not create a cloud resource unless
the Oracle console shows `Always Free eligible` and an estimated cost of `0`.

## Bootstrap

Set the VM address, SSH key, and the operator's exact public IPv4 `/32`:

```bash
PRO7_VM_IP="203.0.113.10"
PRO7_HOSTNAME="${PRO7_VM_IP}.sslip.io"
PRO7_KEY="$HOME/.ssh/pro7_oracle_free"
OPERATOR_CIDR="198.51.100.20/32"
chmod 600 "$PRO7_KEY"
scp -i "$PRO7_KEY" ops/oracle/bootstrap-ubuntu.sh "ubuntu@$PRO7_VM_IP:/tmp/bootstrap-ubuntu.sh"
ssh -i "$PRO7_KEY" -o IdentitiesOnly=yes "ubuntu@$PRO7_VM_IP" "sudo bash /tmp/bootstrap-ubuntu.sh '$OPERATOR_CIDR'"
```

The bootstrap only installs and configures the host. Configure the Oracle ingress
rules separately: TCP 22 from `OPERATOR_CIDR`, and public TCP 80 and 443. Do not
add an ingress or UFW rule for the Vinext listener.

## Package and deploy

Create the ignored local environment file outside the repository with mode `600`.
It contains exactly `NODE_ENV=production`, `NEXT_PUBLIC_SUPABASE_URL`, and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; never print it.

```bash
PRO7_ENV_FILE="$HOME/.config/pro7/production.env"
chmod 600 "$PRO7_ENV_FILE"
ARCHIVE="$(scripts/package-oracle-release.sh)"
scripts/deploy-oracle-release.sh \
  --ip "$PRO7_VM_IP" \
  --key "$PRO7_KEY" \
  --env-file "$PRO7_ENV_FILE" \
  --archive "$ARCHIVE"
```

## Roll back a release

Choose an exact retained release name from the first command, then move only the
`current` symlink and restart the application:

```bash
ssh -i "$PRO7_KEY" -o IdentitiesOnly=yes "ubuntu@$PRO7_VM_IP" 'sudo find /opt/pro7/releases -mindepth 1 -maxdepth 1 -type d -printf "%f\n" | sort'
ssh -i "$PRO7_KEY" -o IdentitiesOnly=yes "ubuntu@$PRO7_VM_IP" 'sudo ln -sfn /opt/pro7/releases/<release-name> /opt/pro7/current && sudo systemctl restart pro7'
```

## Status and logs

```bash
ssh -i "$PRO7_KEY" -o IdentitiesOnly=yes "ubuntu@$PRO7_VM_IP" 'sudo systemctl status pro7 caddy --no-pager'
ssh -i "$PRO7_KEY" -o IdentitiesOnly=yes "ubuntu@$PRO7_VM_IP" 'sudo journalctl -u pro7 -u caddy -n 200 --no-pager'
```

## DNS and port verification

The `sslip.io` hostname must resolve to the VM address before Caddy can obtain a
certificate. Verify DNS, redirect/TLS behavior, and that the loopback-only app
port cannot be reached publicly:

```bash
getent ahostsv4 "$PRO7_HOSTNAME"
curl -fsSI "http://$PRO7_HOSTNAME/"
curl -fsSI "https://$PRO7_HOSTNAME/login"
if curl -fsS --connect-timeout 5 "http://$PRO7_VM_IP:3000/"; then
  echo "Unexpected: port 3000 is publicly reachable." >&2
  exit 1
fi
```
