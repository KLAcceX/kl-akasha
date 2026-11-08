#!/usr/bin/env node
// Is this module the script node was started with? Node gives a module its real path and leaves
// argv[1] as typed, so a plain comparison is false through a symlink or junction (a plugin folder
// linked for development) and the script exits 0 having done nothing.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function isMain(moduleUrl) {
  try {
    return moduleUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMain(import.meta.url) && process.argv.includes("--self-test")) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "is-main-")));
  try {
    const real = join(dir, "real");
    const link = join(dir, "link");
    mkdirSync(real);
    symlinkSync(real, link, "junction");
    const script = `import { isMain } from ${JSON.stringify(import.meta.url)}; console.log(isMain(import.meta.url));`;
    writeFileSync(join(real, "s.mjs"), script);
    writeFileSync(join(real, "t.mjs"), `import ${JSON.stringify(pathToFileURL(join(real, "s.mjs")).href)};`);
    const run = (file) => execFileSync(process.execPath, [file], { encoding: "utf8" }).trim();
    assert.equal(run(join(real, "s.mjs")), "true");
    assert.equal(run(join(link, "s.mjs")), "true", "started through a link");
    assert.equal(run(join(real, "t.mjs")), "false", "imported by another script");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("self-test ok");
}
