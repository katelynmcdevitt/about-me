import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const coverageDir = mkdtempSync(path.join(tmpdir(), "about-me-coverage-"));
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(name) : [name];
  });
}
try {
  const tests = filesUnder(path.join(root, "tests")).filter((file) => file.endsWith(".test.mjs")).sort();
  if (!tests.length) throw new Error("No test files found.");
  const result = spawnSync(process.execPath, ["--experimental-test-coverage", "--test", ...tests], {
    cwd: root, env: { ...process.env, NODE_V8_COVERAGE: coverageDir }, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else {
    const loaded = new Set();
    for (const name of readdirSync(coverageDir).filter((name) => name.endsWith(".json"))) {
      const report = JSON.parse(readFileSync(path.join(coverageDir, name), "utf8"));
      for (const script of report.result ?? []) {
        if (script.url.startsWith("file:")) {
          try { loaded.add(path.resolve(fileURLToPath(script.url))); } catch { /* Ignore non-file script URLs. */ }
        }
      }
    }
    const missing = filesUnder(path.join(root, "src")).filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".d.ts") && !loaded.has(path.resolve(file))).sort();
    console.log("\nSource files not loaded by the test suite (includes type-only and framework entry files):");
    if (missing.length) for (const file of missing) console.log(`  ${path.relative(root, file)}`);
    else console.log("  None");
    console.log(`\n${missing.length} source file(s) not loaded. Node's percentages above cover loaded files only; source-map and branch limitations apply.`);
  }
} finally {
  rmSync(coverageDir, { recursive: true, force: true });
}
