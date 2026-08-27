import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readRepositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("deploy rejects a production environment for any Supabase project other than PRO7", async (t) => {
  const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "pro7-oracle-contract-"));
  t.after(() => rm(fixtureDirectory, { force: true, recursive: true }));

  const keyFile = path.join(fixtureDirectory, "pro7-key");
  const environmentFile = path.join(fixtureDirectory, "production.env");
  const archiveFile = path.join(fixtureDirectory, `pro7-${"a".repeat(40)}.tar.gz`);
  await Promise.all([
    writeFile(keyFile, "test private key\n"),
    writeFile(
      environmentFile,
      [
        "NODE_ENV=production",
        "NEXT_PUBLIC_SUPABASE_URL=https://unapproved-project.supabase.co",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable-key",
      ].join("\n"),
    ),
  ]);
  await chmod(keyFile, 0o600);
  await chmod(environmentFile, 0o600);
  await writeFile(path.join(fixtureDirectory, "ssh"), "#!/usr/bin/env bash\nexit 97\n");
  await writeFile(path.join(fixtureDirectory, "scp"), "#!/usr/bin/env bash\nexit 97\n");
  await chmod(path.join(fixtureDirectory, "ssh"), 0o700);
  await chmod(path.join(fixtureDirectory, "scp"), 0o700);
  await writeFile(path.join(fixtureDirectory, "package.json"), "{}\n");
  execFileSync(
    "tar",
    ["-czf", archiveFile, "-C", fixtureDirectory, "package.json"],
    { env: { ...process.env, LC_ALL: "C" } },
  );

  const result = spawnSync(
    "bash",
    [
      path.join(repositoryRoot, "scripts/deploy-oracle-release.sh"),
      "--ip",
      "203.0.113.10",
      "--key",
      keyFile,
      "--env-file",
      environmentFile,
      "--archive",
      archiveFile,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        LC_ALL: "C",
        PATH: `${fixtureDirectory}:${process.env.PATH}`,
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /NEXT_PUBLIC_SUPABASE_URL must be https:\/\/pficsujapinkmqsyvcfw\.supabase\.co/u,
  );
});

test("Oracle hosting assets keep Vinext private and deployment credentials out of releases", async () => {
  const [service, caddy, bootstrapScript, packageScript, deployScript, readme] = await Promise.all([
    readRepositoryFile("ops/oracle/pro7.service"),
    readRepositoryFile("ops/oracle/Caddyfile.template"),
    readRepositoryFile("ops/oracle/bootstrap-ubuntu.sh"),
    readRepositoryFile("scripts/package-oracle-release.sh"),
    readRepositoryFile("scripts/deploy-oracle-release.sh"),
    readRepositoryFile("ops/oracle/README.md"),
  ]);
  const allAssets = [service, caddy, bootstrapScript, packageScript, deployScript, readme].join("\n");

  assert.match(service, /User=pro7/u);
  assert.match(service, /Group=pro7/u);
  assert.match(service, /127\.0\.0\.1/u);
  assert.doesNotMatch(service, /0\.0\.0\.0:3000/u);
  assert.match(service, /EnvironmentFile=\/opt\/pro7\/shared\/production\.env/u);
  assert.match(service, /NoNewPrivileges=true/u);
  assert.match(service, /PrivateTmp=true/u);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3000/u);
  assert.match(caddy, /\{\$PRO7_HOSTNAME\}/u);
  assert.match(packageScript, /git archive/u);
  assert.match(packageScript, /git diff --quiet HEAD/u);
  assert.match(packageScript, /git rev-parse HEAD/u);
  assert.match(packageScript, /\.env\.local/u);
  assert.doesNotMatch(allAssets, /service_role|SUPABASE_SECRET_KEY/u);
  assert.match(deployScript, /NEXT_PUBLIC_SUPABASE_URL/u);
  assert.match(deployScript, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/u);

  for (const script of [bootstrapScript, packageScript, deployScript]) {
    assert.match(script, /set -euo pipefail/u);
  }

  assert.match(bootstrapScript, /OPERATOR_CIDR/u);
  assert.match(bootstrapScript, /gpg --dearmor --yes/u);
  assert.match(bootstrapScript, /ufw allow from "\$OPERATOR_CIDR" to any port 22 proto tcp/u);
  assert.doesNotMatch(bootstrapScript, /port 3000/u);
  assert.match(deployScript, /IPv4/u);
  assert.match(deployScript, /-f "\$key_file"/u);
  assert.match(deployScript, /%a/u);
  assert.match(deployScript, /600/u);
  assert.match(deployScript, /mktemp/u);
  assert.match(deployScript, /chmod 600/u);
  assert.match(deployScript, /npm ci/u);
  assert.match(deployScript, /npm run build/u);
  assert.match(deployScript, /127\.0\.0\.1:3000/u);
  assert.match(deployScript, /https:\/\/\$hostname/u);
  assert.match(deployScript, /ln -sfn/u);
  assert.match(deployScript, /previous_release/u);
  assert.doesNotMatch(deployScript, /oracle\s+(compute|network|iam)/iu);
});
