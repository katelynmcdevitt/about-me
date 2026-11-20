import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("../../scripts/test-coverage.mjs", import.meta.url));
function fixture(testSource, run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "coverage-report-test-"));
  try {
    mkdirSync(path.join(dir, "src"));
    mkdirSync(path.join(dir, "tests"));
    writeFileSync(path.join(dir, "src", "unloaded.ts"), "export const value = 1;\n");
    writeFileSync(path.join(dir, "tests", "fixture.test.mjs"), testSource);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    run(spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8", env }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("coverage report identifies unloaded source files", () => {
  fixture('import { test } from "node:test"; test("pass", () => {});', (result) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /src\/unloaded\.ts/);
    assert.match(result.stdout, /1 source file\(s\) not loaded/);
  });
});

test("coverage command fails when the test suite fails", () => {
  fixture('import { test } from "node:test"; test("fail", () => { throw Error("failure"); });', (result) => {
    assert.notEqual(result.status, 0);
  });
});
