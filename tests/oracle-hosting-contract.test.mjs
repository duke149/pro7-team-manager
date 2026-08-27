import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployScriptPath = path.join(repositoryRoot, "scripts/deploy-oracle-release.sh");
const packageScriptPath = path.join(repositoryRoot, "scripts/package-oracle-release.sh");
const approvedUrl = "https://pficsujapinkmqsyvcfw.supabase.co";
const validPublishableKey = "sb_publishable_contract_test_key";

async function readRepositoryFile(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

async function createDeployFixture(t, environmentLines) {
  const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "pro7-oracle-contract-"));
  t.after(() => rm(fixtureDirectory, { force: true, recursive: true }));

  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const keyFile = path.join(fixtureDirectory, "pro7-key");
  const environmentFile = path.join(fixtureDirectory, "production.env");
  const archiveFile = path.join(fixtureDirectory, "pro7-" + gitSha + ".tar.gz");
  await Promise.all([
    writeFile(keyFile, "test private key\n"),
    writeFile(environmentFile, environmentLines.join("\n")),
    writeFile(path.join(fixtureDirectory, "ssh"), "#!/usr/bin/env bash\nexit 97\n"),
    writeFile(path.join(fixtureDirectory, "scp"), "#!/usr/bin/env bash\nexit 97\n"),
    writeFile(path.join(fixtureDirectory, "package.json"), "{\"name\":\"untrusted-archive\"}\n"),
  ]);
  await Promise.all([
    chmod(keyFile, 0o600),
    chmod(environmentFile, 0o600),
    chmod(path.join(fixtureDirectory, "ssh"), 0o700),
    chmod(path.join(fixtureDirectory, "scp"), 0o700),
  ]);
  execFileSync(
    "tar",
    ["-czf", archiveFile, "-C", fixtureDirectory, "package.json"],
    { env: { ...process.env, LC_ALL: "C" } },
  );

  return { archiveFile, environmentFile, fixtureDirectory, keyFile };
}

function runDeploy(fixture, options = {}) {
  return spawnSync(
    "bash",
    [
      deployScriptPath,
      "--ip",
      options.ipAddress ?? "8.8.8.8",
      "--key",
      fixture.keyFile,
      "--env-file",
      fixture.environmentFile,
      "--archive",
      fixture.archiveFile,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        LC_ALL: "C",
        PATH: fixture.fixtureDirectory + ":" + process.env.PATH,
      },
    },
  );
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
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_contract_test_key",
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
      "8.8.8.8",
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
  assert.doesNotMatch(deployScript, /source \/opt\/pro7\/shared\/production\.env/u);
  assert.doesNotMatch(deployScript, /oracle\s+(compute|network|iam)/iu);
});

test("deploy rejects elevated and command-shaped keys before remote transfer", async (t) => {
  for (const publishableKey of [
   "sb_secret_contract_test_key",
   "sb_publishable_contract$(touch injected)",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.a",
  ]) {
    const fixture = await createDeployFixture(t, [
      "NODE_ENV=production",
      "NEXT_PUBLIC_SUPABASE_URL=" + approvedUrl,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" + publishableKey,
    ]);
    const result = runDeploy(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be a Supabase publishable key or a legacy anon key/u);
  }
});

test("deploy rejects a SHA-named archive that is not its exact Git archive", async (t) => {
  const fixture = await createDeployFixture(t, [
    "NODE_ENV=production",
    "NEXT_PUBLIC_SUPABASE_URL=" + approvedUrl,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" + validPublishableKey,
  ]);
  const result = runDeploy(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--archive must exactly match git archive for its Git SHA/u);
});

test("deploy rejects reserved addresses and private-key files without mode 600", async (t) => {
  const fixture = await createDeployFixture(t, [
    "NODE_ENV=production",
    "NEXT_PUBLIC_SUPABASE_URL=" + approvedUrl,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" + validPublishableKey,
  ]);
  const invalidAddress = runDeploy(fixture, { ipAddress: "192.0.2.10" });
  assert.notEqual(invalidAddress.status, 0);
  assert.match(invalidAddress.stderr, /valid public IPv4/u);

  await chmod(fixture.keyFile, 0o644);
  const invalidMode = runDeploy(fixture);
  assert.notEqual(invalidMode.status, 0);
  assert.match(invalidMode.stderr, /mode 600/u);
});

test("package refuses nested tracked .env.local files", async (t) => {
  const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "pro7-oracle-package-"));
  t.after(() => rm(fixtureDirectory, { force: true, recursive: true }));
  await writeFile(path.join(fixtureDirectory, "package.json"), "{}\n");
  await mkdir(path.join(fixtureDirectory, "nested"));
  await writeFile(path.join(fixtureDirectory, "nested/.env.local"), "tracked\n");
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: fixtureDirectory });
  execFileSync("git", ["config", "user.email", "contract@example.test"], { cwd: fixtureDirectory });
  execFileSync("git", ["config", "user.name", "Contract Test"], { cwd: fixtureDirectory });
  execFileSync("git", ["add", "."], { cwd: fixtureDirectory });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: fixtureDirectory });

  const result = spawnSync("bash", [packageScriptPath], {
    cwd: fixtureDirectory,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to archive \.env\.local/u);
});

test("bootstrap uses the Caddy source keyring path and guards lockout-prone changes", async () => {
  const bootstrapScript = await readRepositoryFile("ops/oracle/bootstrap-ubuntu.sh");
  assert.match(bootstrapScript, /\/usr\/share\/keyrings\/caddy-stable-archive-keyring\.gpg/u);
  assert.match(bootstrapScript, /SSH_CONNECTION/u);
  assert.match(bootstrapScript, /22\.13\.0/u);
  assert.match(bootstrapScript, /operator_session_ip/u);
  assert.match(bootstrapScript, /before UFW or SSH hardening/u);
});

test("remote deployment waits for readiness and clears current on first-release failure", async () => {
  const deployScript = await readRepositoryFile("scripts/deploy-oracle-release.sh");
  assert.match(
    deployScript,
    /for attempt in \{1\.\.30\}; do[\s\S]*curl -fsS http:\/\/127\.0\.0\.1:3000\/[\s\S]*sleep 1/u,
  );
  assert.match(deployScript, /sudo rm -f \/opt\/pro7\/current/u);
});
