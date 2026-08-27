import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

import {
  parseWranglerDryRun,
  scanServerBundle,
  validateWorkerConfig,
  WORKER_NAME,
} from "./cloudflare-build-contract.mjs";

function parseArguments(argv) {
  if (argv.length === 0) return { wranglerOutputPath: null };
  if (argv.length === 2 && argv[0] === "--wrangler-output" && argv[1]) {
    return { wranglerOutputPath: argv[1] };
  }
  throw new Error("Usage: verify-cloudflare-build.mjs [--wrangler-output <path>]");
}

async function requirePath(path, label) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`${label} is missing`);
  }
}

async function main() {
  const { wranglerOutputPath } = parseArguments(process.argv.slice(2));
  const serverDir = resolve("dist/server");
  const clientDir = resolve("dist/client");
  const configPath = resolve(serverDir, "wrangler.json");
  const entryPath = resolve(serverDir, "index.js");

  await requirePath(configPath, "Generated Wrangler configuration");
  await requirePath(entryPath, "Generated Worker entrypoint");
  await requirePath(clientDir, "Generated static asset directory");

  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    throw new Error("Generated Wrangler configuration is not valid JSON");
  }

  const errors = [
    ...validateWorkerConfig(config),
    ...(await scanServerBundle(serverDir)),
  ];
  if (errors.length > 0) {
    throw new Error(`Cloudflare build contract failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  let gzipBytes = null;
  if (wranglerOutputPath) {
    const output = await readFile(resolve(wranglerOutputPath), "utf8");
    gzipBytes = parseWranglerDryRun(output).gzipBytes;
  }

  const size = gzipBytes == null ? "gzip=pending-dry-run" : `gzip=${gzipBytes}B`;
  console.log(`Cloudflare build verified: worker=${WORKER_NAME} ${size}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Cloudflare build verification failed";
  console.error(message);
  process.exitCode = 1;
});
