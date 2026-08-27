import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export const WORKER_NAME = "pro7-team-manager";
export const COMPATIBILITY_DATE = "2026-08-27";
export const MAX_GZIP_BYTES = 3 * 1024 * 1024;

const ARRAY_RESOURCE_KEYS = [
  "d1_databases",
  "r2_buckets",
  "kv_namespaces",
  "services",
  "hyperdrive",
];

const OPTIONAL_ARRAY_RESOURCE_KEYS = [
  "vectorize",
  "ai_search_namespaces",
  "ai_search",
  "workflows",
  "secrets_store_secrets",
  "artifacts",
  "analytics_engine_datasets",
  "dispatch_namespaces",
  "send_email",
  "mtls_certificates",
  "pipelines",
  "vpc_services",
  "vpc_networks",
  "containers",
];

const OPTIONAL_RESOURCE_KEYS = [
  "ai",
  "browser",
  "images",
  "version_metadata",
  "tail_consumers",
];

function isEmptyResource(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function validateWorkerConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["Generated Worker configuration must be an object"];
  }

  if (config.name !== WORKER_NAME) errors.push("Worker name must be pro7-team-manager");
  if (config.main !== "index.js") errors.push("Worker main must be index.js");
  if (config.compatibility_date !== COMPATIBILITY_DATE) {
    errors.push("Compatibility date must be 2026-08-27");
  }
  if (
    !Array.isArray(config.compatibility_flags) ||
    config.compatibility_flags.length !== 1 ||
    config.compatibility_flags[0] !== "nodejs_compat"
  ) {
    errors.push("Compatibility flags must contain only nodejs_compat");
  }
  if (config.no_bundle !== true) errors.push("Generated Worker must use no_bundle");
  if (config.assets?.directory !== "../client") errors.push("Static asset directory mismatch");

  for (const key of ARRAY_RESOURCE_KEYS) {
    if (!Array.isArray(config[key]) || config[key].length !== 0) {
      errors.push(`${key} resource bindings must be present and empty`);
    }
  }
  for (const key of OPTIONAL_ARRAY_RESOURCE_KEYS) {
    if (!isEmptyResource(config[key])) errors.push(`${key} resource binding is forbidden`);
  }

  if (!Array.isArray(config.durable_objects?.bindings) || config.durable_objects.bindings.length !== 0) {
    errors.push("Durable Object bindings must be present and empty");
  }
  if (
    !Array.isArray(config.queues?.producers) ||
    !Array.isArray(config.queues?.consumers) ||
    config.queues.producers.length !== 0 ||
    config.queues.consumers.length !== 0
  ) {
    errors.push("Queue bindings must be present and empty");
  }
  for (const key of OPTIONAL_RESOURCE_KEYS) {
    if (!isEmptyResource(config[key])) errors.push(`${key} resource binding is forbidden`);
  }
  if (!isEmptyResource(config.cloudchamber)) errors.push("Container bindings are forbidden");
  if (!isEmptyResource(config.routes)) errors.push("Custom routes are forbidden for workers.dev release");
  if (!isEmptyResource(config.route)) errors.push("A custom route is forbidden for workers.dev release");

  return errors;
}

async function* walkTextFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTextFiles(path);
    } else if (/\.(?:js|mjs|cjs|json)$/i.test(entry.name)) {
      yield path;
    }
  }
}

export async function scanServerBundle(rootDir) {
  const errors = [];
  for await (const path of walkTextFiles(rootDir)) {
    const text = await readFile(path, "utf8");
    const displayPath = relative(rootDir, path);
    if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) {
      errors.push(`${displayPath} contains a secret key`);
    }

    for (const token of text.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
      try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
        if (payload?.role === "service_role") {
          errors.push(`${displayPath} contains a service-role JWT`);
          break;
        }
      } catch {
        // Ordinary dotted strings are not JWTs and are safe to ignore.
      }
    }
  }
  return errors;
}

export function parseWranglerDryRun(output) {
  const match = output.match(/gzip:\s*([0-9]+(?:\.[0-9]+)?)\s*(KiB|MiB)/i);
  if (!match) throw new Error("Wrangler dry-run gzip size was not found");

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const gzipBytes = Math.round(value * (unit === "mib" ? 1024 ** 2 : 1024));
  if (!Number.isFinite(gzipBytes) || gzipBytes < 0) {
    throw new Error("Wrangler dry-run gzip size is invalid");
  }
  if (gzipBytes > MAX_GZIP_BYTES) {
    throw new Error("Worker gzip size exceeds the 3 MiB Free limit");
  }
  return { gzipBytes };
}
