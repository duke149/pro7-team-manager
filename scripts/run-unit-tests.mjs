import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

function discoverTests() {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.mjs")) files.push(relative(root, absolute));
    }
  }
  visit(join(root, "tests"));
  return files;
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : discoverTests();
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...targets], {
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
