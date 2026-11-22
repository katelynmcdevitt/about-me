import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const hook = resolve(".githooks/pre-commit");

test("pre-commit checks staged contents without changing working files", () => {
  const directory = mkdtempSync(join(tmpdir(), "format-hook-"));
  const run = (command, args) =>
    spawnSync(command, args, { cwd: directory, encoding: "utf8" });
  try {
    assert.equal(run("git", ["init", "-q"]).status, 0);
    symlinkSync(
      resolve("node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    const source = join(directory, "example.js");
    writeFileSync(source, "const value=1\n");
    assert.equal(run("git", ["add", "example.js"]).status, 0);
    writeFileSync(source, "const value = 1;\n");
    const rejected = run("sh", [hook]);
    assert.equal(rejected.status, 1, rejected.stderr);
    assert.equal(readFileSync(source, "utf8"), "const value = 1;\n");
    assert.equal(run("git", ["add", "example.js"]).status, 0);
    writeFileSync(source, "const value=2\n");
    const accepted = run("sh", [hook]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(readFileSync(source, "utf8"), "const value=2\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
