# PRO7 Oracle Always Free Hosting Design

**Status:** Approved in conversation on 2026-08-27

## Goal

Publish the current verified PRO7 Vinext application from its existing feature-branch commit on a single Oracle Cloud Always Free VM. The public application must use the existing Supabase production project `pficsujapinkmqsyvcfw` for Auth, Database, Storage, and Edge Functions without copying, reseeding, or resetting production data.

The temporary public origin is `https://<public-ip>.sslip.io`. A future custom domain must be swappable without changing the application architecture.

## Non-goals

- Do not create any resource with a non-zero estimated cost.
- Do not create a load balancer, NAT Gateway, reserved public IP, managed database, or paid monitoring product.
- Do not migrate, clone, reset, seed, or otherwise rewrite Supabase production data.
- Do not deploy a Supabase `service_role`, database password, JWT secret, Auth token, user password, or SSH private key to the repository, browser bundle, command log, or chat.
- Do not introduce Docker or CI/CD for the first release.
- Do not revert the current production team name or slug (`FC NÁT`, `nat-fc`).

## Architecture

```text
Browser
  -> HTTPS https://<public-ip>.sslip.io
  -> Caddy on ports 80/443
  -> Vinext on 127.0.0.1:3000
  -> Supabase production pficsujapinkmqsyvcfw
```

The VM runs one native Node.js process managed by systemd. Caddy is the only public application listener and manages ACME certificates. Vinext is bound to loopback so port 3000 is never exposed through Oracle ingress or the host firewall.

## Oracle resource envelope

- Home region: Singapore (`SIN`).
- Shape: `VM.Standard.A1.Flex` with exactly 1 OCPU and 6 GB memory.
- Image: Ubuntu 24.04 LTS ARM64.
- Boot volume: the console default only when it remains inside the tenancy's Always Free storage allowance.
- One ephemeral public IPv4 address.
- No optional paid backup, additional block volume, load balancer, or reserved address.

Creation has a hard safety gate: the Oracle console must show `Always Free eligible` and an estimated cost of `0`. If the shape is unavailable, the console removes the free label, the estimate is non-zero, or the tenancy quota is ambiguous, provisioning stops. There is no automatic paid fallback.

## Network and host security

- TCP 22 is allowed only from the operator's current public IPv4 address using a `/32` source rule.
- TCP 80 and 443 are public.
- TCP 3000 has no Oracle ingress rule and no UFW allow rule.
- SSH uses a dedicated Ed25519 key. The private key remains local with mode `0600`; only the public key is uploaded to Oracle.
- Password SSH and root SSH are disabled after key access is verified.
- UFW mirrors the Oracle ingress policy.
- The app runs as a dedicated non-login `pro7` user. It does not run as root.
- systemd uses `NoNewPrivileges`, a private temporary directory, and protected system paths.

## Release model

```text
/opt/pro7/
  releases/<timestamp>-<git-sha>/
  current -> releases/<timestamp>-<git-sha>/
  shared/production.env
```

Only tracked files from an exact Git commit are packaged. `.git`, local environment files, caches, untracked skill directories, `node_modules`, build output, and `supabase/.temp/` never enter the release archive.

Each release performs a clean `npm ci` and `npm run build` on the ARM host. The `current` symlink moves only after the build and local health check succeed. systemd runs `vinext start` from `current`, bound to `127.0.0.1:3000`. A failed public check switches `current` back to the prior release and restarts the service.

The production environment file lives outside every release, is owned by `root:pro7`, has mode `0640`, and contains only:

- `NODE_ENV=production`
- `NEXT_PUBLIC_SUPABASE_URL=https://pficsujapinkmqsyvcfw.supabase.co`
- one active publishable or legacy anon key for `pficsujapinkmqsyvcfw`

No elevated Supabase credential is allowed on the VM.

## Reverse proxy and TLS

Caddy serves the exact hostname derived from the public IPv4 address: `<public-ip>.sslip.io`. It redirects HTTP to HTTPS, reverse-proxies to `127.0.0.1:3000`, enables compression, and adds conservative response security headers without changing application cookies or route behavior.

The hostname must resolve to the VM before Caddy is expected to obtain a certificate. If ACME issuance fails, the app remains inaccessible publicly rather than falling back to plain HTTP for authenticated production use.

## Supabase production-origin configuration

The new public origin is added to Supabase Auth URL Configuration:

- Site URL becomes `https://<public-ip>.sslip.io` for the public deployment.
- Additional redirect URLs retain `http://localhost:3000/**`, retain the existing hosted origin, and add `https://<public-ip>.sslip.io/**`.

Both deployed Edge Functions that read `ALLOWED_ORIGINS` must receive one exact project-wide value containing:

- `http://localhost:3000`
- `https://pro7-team-manager.duke149-work.chatgpt.site`
- `https://<public-ip>.sslip.io`

Origin entries contain no path, query, fragment, wildcard host, or trailing slash. Updating the secret must not redeploy source or change database schema.

## Verification

Before provisioning:

- Existing branch and linked worktree are confirmed.
- `npm run test:unit` passes all runnable tests.
- `npm test` completes the production build and rendered HTML checks.

After provisioning and deployment:

- Oracle shows only the approved free resource and no non-zero estimated cost.
- DNS resolves the hostname to the VM.
- HTTP redirects to HTTPS and the certificate is valid.
- Ports 22, 80, and 443 match the approved policy; port 3000 is not reachable publicly.
- systemd and Caddy are active and survive a controlled service restart.
- The login page, authenticated root redirect, and `nat-fc` overview load from the public hostname.
- One existing Admin account sees Overview, Squad, Matches, Tactics, Funds, and Settings.
- One existing Member account cannot access Funds or Admin Settings and can access the member routes permitted by RBAC.
- A Member RSVP mutation and its resulting Admin attendance view are verified against an existing suitable match, or a uniquely marked reversible smoke match is created and removed by exact ID.
- Password recovery returns neutral feedback and generates a redirect under the approved public origin; mailbox delivery is not claimed for reserved `@pro7.test` identities.
- Desktop and phone layouts are visually inspected, including the Admin five-item and Member authorized bottom navigation.

## Production data safety

No general demo seed is run. Any CRUD smoke record uses the marker `PRO7-HOST-SMOKE`, is recorded by exact database identity, and is removed only by that identity. Existing matches, finance entries, tactics, players, memberships, roles, team settings, Auth users, avatars, and audit history are not deleted or rewritten for deployment testing.

## Rollback and recovery

- Application rollback changes only the `/opt/pro7/current` symlink and restarts `pro7.service`.
- Supabase URL configuration and Edge Function origin configuration are retained when rolling back to a release that supports the same hostname.
- Hosting rollback never performs database rollback.
- If the VM cannot be created within Always Free capacity, the existing localhost and hosted deployment remain untouched.

## Acceptance criteria

The deployment is complete only when the public HTTPS origin loads the exact current PRO7 frontend, authenticates against `pficsujapinkmqsyvcfw`, passes Admin and Member route checks, performs the reviewed RSVP smoke flow, exposes no elevated credential, keeps port 3000 private, and Oracle shows no resource outside the approved zero-cost envelope.
