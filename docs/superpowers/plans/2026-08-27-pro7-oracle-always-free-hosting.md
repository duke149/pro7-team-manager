# PRO7 Oracle Always Free Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the verified PRO7 Vinext application on one zero-cost Oracle Always Free VM with HTTPS while retaining the existing Supabase production backend.

**Architecture:** A native Node.js 22 Vinext process runs under systemd on loopback, with Caddy terminating HTTPS for an IP-derived `sslip.io` hostname. Git-tracked release archives are built on the ARM VM and atomically activated through a release symlink; Supabase Auth and Edge Function origin configuration are extended to the new public origin without schema or data migration.

**Tech Stack:** Oracle Cloud Infrastructure, Ubuntu 24.04 ARM64, Node.js 22, npm, Vinext, systemd, Caddy, Bash, Supabase Auth/Edge Functions, in-app browser.

**Spec:** `docs/superpowers/specs/2026-08-27-pro7-oracle-always-free-hosting-design.md`

## Global Constraints

- Create only `Always Free eligible` Oracle resources whose console estimate is exactly `0`.
- Stop instead of choosing a paid shape, paid network product, paid backup, or larger-than-free storage resource.
- Use exactly `VM.Standard.A1.Flex`, 1 OCPU, 6 GB memory, Ubuntu 24.04 ARM64 when available.
- Restrict SSH to the operator's current public IPv4 `/32`; expose only TCP 80 and 443 publicly.
- Keep Vinext bound to `127.0.0.1:3000`; never expose port 3000.
- Connect only to Supabase project `pficsujapinkmqsyvcfw` with a publishable or legacy anon key.
- Never copy a `service_role`, secret key, database password, JWT secret, Auth token, user password, cookie, or SSH private key into Git, logs, screenshots, tests, or chat.
- Do not change database schema, seed production, reset data, or revert `FC NÁT` / `nat-fc`.
- Preserve unrelated worktree content, `.agents/skills/`, and `supabase/.temp/`.
- Every external mutation is preceded by a read-only state check and followed by a targeted verification.

---

### Task 1: Deployment Contracts and Reusable Host Assets

**Files:**
- Create: `tests/oracle-hosting-contract.test.mjs`
- Create: `ops/oracle/pro7.service`
- Create: `ops/oracle/Caddyfile.template`
- Create: `ops/oracle/bootstrap-ubuntu.sh`
- Create: `scripts/package-oracle-release.sh`
- Create: `scripts/deploy-oracle-release.sh`
- Create: `ops/oracle/README.md`

**Interfaces:**
- Produces: a tracked release archive made only from `git archive HEAD`, a validated remote deploy command, a hardened `pro7.service`, and a Caddy template consuming one validated `PRO7_HOSTNAME`.
- Consumes: Node engine `>=22.13.0`, package scripts `build` and `start`, and a local ignored production environment file with the two public Supabase variables.

- [ ] **Step 1: Write the failing deployment contract test**

Create `tests/oracle-hosting-contract.test.mjs` to assert all of the following:

```js
assert.match(service, /User=pro7/u);
assert.match(service, /127\.0\.0\.1/u);
assert.doesNotMatch(service, /0\.0\.0\.0:3000/u);
assert.match(service, /EnvironmentFile=\/opt\/pro7\/shared\/production\.env/u);
assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3000/u);
assert.match(packageScript, /git archive/u);
assert.doesNotMatch(allAssets, /service_role|SUPABASE_SECRET_KEY/u);
assert.match(deployScript, /NEXT_PUBLIC_SUPABASE_URL/u);
assert.match(deployScript, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/u);
```

Also assert that both shell scripts use `set -euo pipefail`, reject a non-IPv4 host, reject a private-key file whose mode is not `600`, never archive `.env.local`, and never add an ingress rule for port 3000.

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/oracle-hosting-contract.test.mjs`

Expected: FAIL because the Oracle hosting assets do not exist.

- [ ] **Step 3: Implement the minimal host assets**

Implement:

- `bootstrap-ubuntu.sh` with Ubuntu detection, idempotent `pro7` user/directories, Node 22 and Caddy installation, UFW rules supplied by exact operator CIDR, SSH hardening after key verification, and no Oracle resource creation logic.
- `pro7.service` with `User=pro7`, `Group=pro7`, `/opt/pro7/current`, `/opt/pro7/shared/production.env`, loopback Vinext start, restart-on-failure, `NoNewPrivileges=true`, `PrivateTmp=true`, and protected system paths.
- `Caddyfile.template` with `PRO7_HOSTNAME`, automatic HTTPS, compression, `127.0.0.1:3000`, and conservative security headers.
- `package-oracle-release.sh` using `git archive HEAD`, a clean tracked HEAD requirement, and an output filename containing the exact Git SHA.
- `deploy-oracle-release.sh` accepting `--ip`, `--key`, `--env-file`, and `--archive`; validating every input; uploading secrets through a mode-600 temporary file rather than command arguments; building a new release; testing loopback; atomically switching `current`; and retaining the prior release for rollback.
- `README.md` with exact bootstrap, deploy, rollback, status, log, DNS, and port-verification commands.

- [ ] **Step 4: Verify GREEN and shell syntax**

Run:

```bash
node --test tests/oracle-hosting-contract.test.mjs
bash -n ops/oracle/bootstrap-ubuntu.sh scripts/package-oracle-release.sh scripts/deploy-oracle-release.sh
npm run test:unit
npm test
```

Expected: hosting contracts pass; shell syntax exits 0; unit baseline remains 469 runnable passes; rendered checks remain 7/7.

- [ ] **Step 5: Commit Task 1**

```bash
git add tests/oracle-hosting-contract.test.mjs ops/oracle scripts/package-oracle-release.sh scripts/deploy-oracle-release.sh
git commit -m "feat: add Oracle Always Free deployment assets"
```

---

### Task 2: Provision the Free OCI VM and Lock Down Network Access

**Files:**
- Create in the plan workspace: `task-2-oracle-state.md`
- No repository production-code modification.

**Interfaces:**
- Produces: one public IPv4 address, one `https://<ip>.sslip.io` hostname, and verified SSH access for Task 3.
- Consumes: the approved Singapore tenancy, current operator public IPv4, and a dedicated Ed25519 public key.

- [ ] **Step 1: Capture the read-only pre-state**

In Oracle Cloud, record the root-compartment instance list, active region, Always Free quota indicators, and cost estimate state. Confirm no instance currently exists in the selected compartment.

Resolve the operator IPv4 without logging headers or cookies:

```bash
curl -4fsS https://api.ipify.org
```

Record only the IPv4 and convert it to `<ipv4>/32`.

- [ ] **Step 2: Generate the dedicated local SSH key**

Run with an explicit new path outside the repository:

```bash
ssh-keygen -t ed25519 -a 100 -f "$HOME/.ssh/pro7_oracle_free" -C pro7-oracle-free
chmod 600 "$HOME/.ssh/pro7_oracle_free"
```

Verify that no file at that path existed before generation. Upload only `pro7_oracle_free.pub`.

- [ ] **Step 3: Configure free network resources in the Oracle create flow**

Use the console's default free VCN/public subnet only if every displayed network component has zero estimated cost. Add ingress rules for:

```text
TCP 22  source <operator-ip>/32
TCP 80  source 0.0.0.0/0
TCP 443 source 0.0.0.0/0
```

Confirm there is no TCP 3000 ingress rule.

- [ ] **Step 4: Create the instance behind the hard cost gate**

Select `VM.Standard.A1.Flex`, exactly 1 OCPU and 6 GB memory, Ubuntu 24.04 ARM64, and the default boot volume only when the UI retains `Always Free eligible`. Before pressing Create, verify the estimate is exactly `0`; otherwise stop without creating anything.

- [ ] **Step 5: Verify the created resource**

Wait for `RUNNING`, record the public IPv4, and verify:

```bash
PRO7_VM_IP="the exact public IPv4 shown by Oracle"
ssh -i "$HOME/.ssh/pro7_oracle_free" -o IdentitiesOnly=yes "ubuntu@$PRO7_VM_IP" 'uname -m && lsb_release -ds'
```

Expected: `aarch64` and Ubuntu 24.04. Set `PRO7_HOSTNAME="${PRO7_VM_IP}.sslip.io"`, verify it resolves to the exact public IPv4, and verify Oracle still shows no non-zero estimate.

---

### Task 3: Bootstrap the Host and Deploy the First Release

**Files:**
- Use: `ops/oracle/bootstrap-ubuntu.sh`
- Use: `scripts/package-oracle-release.sh`
- Use: `scripts/deploy-oracle-release.sh`
- Create locally outside Git: a mode-600 production environment file.

**Interfaces:**
- Produces: active `pro7.service`, active Caddy, a valid public HTTPS origin, and a retained prior-release rollback path.
- Consumes: Task 2 IP/key, current verified Git commit, Supabase project URL, and one active publishable key.

- [ ] **Step 1: Read and validate public Supabase configuration without exposing values**

Use the Supabase connector to verify project `pficsujapinkmqsyvcfw`, obtain its exact project URL, and choose one non-disabled publishable key. Validate the URL is exactly `https://pficsujapinkmqsyvcfw.supabase.co`. Never emit the key.

- [ ] **Step 2: Create the local production environment file safely**

Write outside the repository with mode `600`:

```text
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://pficsujapinkmqsyvcfw.supabase.co
```

Write `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as the third variable by transferring the selected active value directly from the authenticated connector result into the mode-600 file. The value must never be interpolated into a displayed command or printed verification output.

Verify names and permissions only; do not print file contents.

- [ ] **Step 3: Bootstrap Ubuntu**

Upload and execute the reviewed bootstrap script with the exact operator `/32`. Reconnect over SSH after SSH hardening and verify:

```bash
node --version
npm --version
caddy version
sudo ufw status numbered
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin) '
```

Expected: Node is at least 22.13.0; UFW allows only the reviewed ports; password authentication and root login are disabled.

- [ ] **Step 4: Package and deploy the exact Git commit**

Run the package script, then the deploy script with the explicit IP, key, environment file, and generated archive. The deploy script must run `npm ci`, `npm run build`, a loopback HTTP probe, symlink activation, and `systemctl restart pro7`.

- [ ] **Step 5: Configure and verify Caddy**

Render `Caddyfile.template` using the exact `PRO7_HOSTNAME` established in Task 2, validate with `caddy validate`, reload Caddy, and verify:

```bash
curl -fsSI "http://$PRO7_HOSTNAME/"
curl -fsSI "https://$PRO7_HOSTNAME/login"
curl -fsS --connect-timeout 5 "http://$PRO7_VM_IP:3000/"
```

Expected: HTTP redirects to HTTPS; HTTPS responds successfully with a valid certificate; direct public port 3000 fails.

---

### Task 4: Authorize the Public Origin in Supabase

**Files:**
- Create in the plan workspace: `task-4-supabase-origin-state.md`
- No database schema or production-row modification.

**Interfaces:**
- Produces: Auth URL configuration and Edge Function `ALLOWED_ORIGINS` that include the exact new HTTPS origin while retaining localhost and the existing hosted origin.
- Consumes: the final hostname from Task 2 and the two deployed functions `change-temporary-password` and `provision-team-member`.

- [ ] **Step 1: Capture read-only Supabase pre-state**

Read the current Auth Site URL, additional redirect URLs, deployed Edge Functions, and current secret names without revealing secret values. Confirm the project ID is `pficsujapinkmqsyvcfw`.

- [ ] **Step 2: Update Auth URL Configuration**

Set Site URL to the exact public origin. Ensure the additional redirect list contains:

```text
http://localhost:3000/**
https://pro7-team-manager.duke149-work.chatgpt.site/**
https://${PRO7_HOSTNAME}/**
```

Do not remove unrelated legitimate existing entries.

- [ ] **Step 3: Set the exact Edge Function origin secret**

Use the authenticated Supabase CLI after discovering exact syntax with `supabase secrets --help`. Set project-wide `ALLOWED_ORIGINS` to the comma-separated localhost, existing hosted origin, and new public origin. Do not include a wildcard and do not print the resulting value.

- [ ] **Step 4: Verify configuration without a data mutation**

Verify Auth configuration through the Dashboard and send CORS preflight requests to both Edge Functions from the exact new origin and from `<origin>.evil.test`.

Expected: the exact origin is reflected; the evil sibling is not reflected. No function source deployment or database migration occurs.

---

### Task 5: Public Admin/Member QA, Reversible CRUD Smoke, and Rollback Drill

**Files:**
- Create in the plan workspace: `task-5-public-qa.md`
- No repository source change unless a verified deployment-specific defect is first reproduced by a failing test.

**Interfaces:**
- Produces: evidence that the public origin is usable, authorized, responsive, backed by production Supabase, and rollback-capable.
- Consumes: public hostname, one existing Admin account, one existing Member account, and the exact production team route `/teams/nat-fc`.

- [ ] **Step 1: Verify anonymous and authentication boundaries**

Use the in-app browser to open the public root and confirm redirect to `/login`. Verify show-password, neutral forgot-password submission behavior, login, logout, cookie continuity, and the authenticated root redirect to `/teams/nat-fc/overview`.

- [ ] **Step 2: Verify Admin route and visual matrix**

With an existing Admin account, inspect Overview, Squad, Matches, Tactics, Funds, and Admin Settings at desktop width and 390 px width. Confirm the Admin bottom navigation has the authorized five-item layout without overflow or pixel displacement.

- [ ] **Step 3: Verify Member route and visual matrix**

With an existing Member account, confirm Funds and Admin Settings are absent and directly denied, personal Profile remains editable, and the member bottom navigation contains only authorized destinations without overflow.

- [ ] **Step 4: Execute one exact reversible match/RSVP flow**

Prefer an existing scheduled match with a pending invitation. If none is suitable, create one Admin-owned match whose opponent or notes contain `PRO7-HOST-SMOKE`, capture its exact ID, invite the selected Member, respond from the Member account, verify the Admin attendance count, then remove or cancel only that exact smoke record through the product's supported lifecycle. Do not edit any unrelated production record.

- [ ] **Step 5: Verify services and rollback mechanics**

Check `systemctl is-active pro7 caddy`, inspect bounded recent logs with secrets redacted, restart `pro7.service`, and verify HTTPS again. Exercise rollback by switching `current` to the retained prior release only when it is a known-good compatible release, verify loopback, then restore the latest release.

- [ ] **Step 6: Run final repository verification**

Run locally:

```bash
npm run test:unit
npm test
git diff --check
git status --short
```

Expected: 469 runnable unit tests pass with 5 environment-gated skips, rendered HTML is 7/7, diff check is clean, and only the pre-existing untracked `.agents/skills/` and `supabase/.temp/` remain outside committed work.

- [ ] **Step 7: Record the final public handoff**

Report the public HTTPS URL, VM shape, zero-cost verification, service status, tested Admin/Member boundaries, reversible smoke cleanup state, rollback command, and any residual capacity or certificate risk. Do not include any credential or private-key path contents.
