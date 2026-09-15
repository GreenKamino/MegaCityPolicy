import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "..", "verify-hook.mjs");

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), "verify-hook-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

function buildEnv(extra = {}) {
  const e = { ...process.env };
  delete e.SKIP_VERIFY_HOOK;
  return { ...e, ...extra };
}

function run(cwd, { postinstall = false, env = {} } = {}) {
  const args = [SCRIPT];
  if (postinstall) args.push("--postinstall");
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: buildEnv(env),
  });
}

function writeHook(repoDir, contents, { executable = true, name = "pre-commit" } = {}) {
  const hooksDir = join(repoDir, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  const path = join(hooksDir, name);
  writeFileSync(path, contents);
  if (executable) chmodSync(path, 0o755);
  else chmodSync(path, 0o644);
  return path;
}

function writeAllHooks(repoDir) {
  // Helper: install a healthy pre-commit AND pre-push so the verifier reports PASS.
  writeHook(repoDir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs\n", {
    name: "pre-commit",
  });
  writeHook(repoDir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs --pre-push\n", {
    name: "pre-push",
  });
}

describe("verify-hook: standalone mode", () => {
  let dir;
  beforeEach(() => {
    dir = initRepo();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("PASS when both hook files contain the guard marker and are executable", () => {
    writeAllHooks(dir);
    const r = run(dir);
    assert.equal(r.status, 0, `stdout=${r.stdout}\nstderr=${r.stderr}`);
    assert.match(r.stdout, /PASS/);
    assert.match(r.stdout, /pre-commit/);
    assert.match(r.stdout, /pre-push/);
  });

  test("FAIL when no pre-commit hook exists", () => {
    // Install the pre-push hook so we isolate the pre-commit failure path.
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs --pre-push\n", {
      name: "pre-push",
    });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FAIL/);
    assert.match(r.stderr, /no pre-commit hook file found/);
    assert.match(r.stderr, /pnpm exec simple-git-hooks/);
  });

  test("FAIL when no pre-push hook exists", () => {
    // Install the pre-commit hook so we isolate the pre-push failure path.
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs\n", {
      name: "pre-commit",
    });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FAIL/);
    assert.match(r.stderr, /no pre-push hook file found/);
    assert.match(r.stderr, /pnpm exec simple-git-hooks/);
  });

  test("FAIL when both hooks are missing reports both", () => {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no pre-commit hook file found/);
    assert.match(r.stderr, /no pre-push hook file found/);
  });

  test("FAIL when hook exists but does not invoke the guard", () => {
    // Install a healthy pre-push so only the pre-commit content failure trips.
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs --pre-push\n", {
      name: "pre-push",
    });
    writeHook(dir, "#!/bin/sh\necho hi\n", { name: "pre-commit" });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /pre-commit hook does not invoke check-staged-archives/);
  });

  test("FAIL when pre-push exists but does not invoke the guard", () => {
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs\n", {
      name: "pre-commit",
    });
    writeHook(dir, "#!/bin/sh\necho hi\n", { name: "pre-push" });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /pre-push hook does not invoke check-staged-archives/);
  });

  test("FAIL when pre-push hook invokes the guard but is missing the --pre-push flag", () => {
    // This is the silent-miswire case: someone copy-pasted the pre-commit hook
    // body into the pre-push slot. The guard would run in pre-commit mode (on
    // git's staging area, which is empty during a push), passing trivially —
    // i.e. zero coverage on push. The doctor must catch it.
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs\n", {
      name: "pre-commit",
    });
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs\n", {
      name: "pre-push",
    });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /pre-push hook is missing required argument: --pre-push/);
  });

  test("FAIL when hook is correct but not executable", { skip: process.platform === "win32" }, () => {
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs --pre-push\n", {
      name: "pre-push",
    });
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs\n", {
      name: "pre-commit",
      executable: false,
    });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /pre-commit hook is not executable/);
  });

  test("FAIL when pre-push is correct but not executable", { skip: process.platform === "win32" }, () => {
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs\n", {
      name: "pre-commit",
    });
    writeHook(dir, "#!/bin/sh\nnode scripts/check-staged-archives.mjs --pre-push\n", {
      name: "pre-push",
      executable: false,
    });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /pre-push hook is not executable/);
  });

  test("respects core.hooksPath when set to a custom directory", () => {
    const customHooksDir = join(dir, ".custom-hooks");
    mkdirSync(customHooksDir, { recursive: true });
    git(dir, ["config", "core.hooksPath", ".custom-hooks"]);
    for (const [hookName, body] of [
      ["pre-commit", "#!/bin/sh\nnode scripts/check-staged-archives.mjs\n"],
      ["pre-push", "#!/bin/sh\nnode scripts/check-staged-archives.mjs --pre-push\n"],
    ]) {
      const path = join(customHooksDir, hookName);
      writeFileSync(path, body);
      chmodSync(path, 0o755);
    }
    const r = run(dir);
    assert.equal(r.status, 0, `stdout=${r.stdout}\nstderr=${r.stderr}`);
    assert.match(r.stdout, /\.custom-hooks/);
  });

  test("SKIP_VERIFY_HOOK=1 short-circuits with exit 0", () => {
    const r = run(dir, { env: { SKIP_VERIFY_HOOK: "1" } });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stderr, /FAIL/);
  });

  test("exits 0 when run outside a git checkout", () => {
    const nonRepo = mkdtempSync(join(tmpdir(), "verify-hook-nogit-"));
    try {
      const r = run(nonRepo);
      assert.equal(r.status, 0);
      assert.doesNotMatch(r.stderr, /FAIL/);
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});

describe("verify-hook: --postinstall mode", () => {
  let dir;
  beforeEach(() => {
    dir = initRepo();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("exits 0 silently when not a git checkout", () => {
    const nonRepo = mkdtempSync(join(tmpdir(), "verify-hook-nogit-pi-"));
    try {
      const r = run(nonRepo, { postinstall: true });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, "");
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });

  test("PASS does not print anything to stdout in postinstall mode", () => {
    writeAllHooks(dir);
    const r = run(dir, { postinstall: true });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });

  test("FAIL prints actionable instructions and exits 1", () => {
    // No hook exists. simple-git-hooks isn't present in this temp repo,
    // so the self-heal attempt is a no-op and verification still fails loudly.
    const r = run(dir, { postinstall: true });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FAIL/);
    assert.match(r.stderr, /pnpm exec simple-git-hooks/);
    assert.match(r.stderr, /pnpm run doctor:hooks/);
  });
});
