import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "..", "check-staged-archives.mjs");
const ZERO_SHA = "0000000000000000000000000000000000000000";
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), "archive-guard-"));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

function writeFile(dir, rel, content) {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function buildEnv(extra = {}) {
  const e = { ...process.env };
  delete e.CHECK_ARCHIVES_CI;
  delete e.CHECK_ARCHIVES_BASE_SHA;
  delete e.CHECK_ARCHIVES_HEAD_SHA;
  return { ...e, ...extra };
}

function runGuard(cwd, { ci = false, env = {} } = {}) {
  const args = [SCRIPT];
  if (ci) args.push("--ci");
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: buildEnv(env),
  });
}

describe("check-staged-archives: pre-commit mode", () => {
  let dir;
  beforeEach(() => {
    dir = initRepo();
  });
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("flags staged .zip outside allow list", () => {
    writeFile(dir, "foo/backup.zip", "fake zip contents");
    git(dir, ["add", "foo/backup.zip"]);
    const r = runGuard(dir);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /backup\.zip/);
    assert.match(r.stderr, /archive file extension/);
  });

  test("flags staged .tar.gz outside allow list", () => {
    writeFile(dir, "foo/backup.tar.gz", "tarball");
    git(dir, ["add", "foo/backup.tar.gz"]);
    const r = runGuard(dir);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /backup\.tar\.gz/);
    assert.match(r.stderr, /archive file extension/);
  });

  test("flags non-archive file >5MB outside allow list", () => {
    writeFile(dir, "big.bin", Buffer.alloc(6 * 1024 * 1024, 0));
    git(dir, ["add", "big.bin"]);
    const r = runGuard(dir);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /big\.bin/);
    assert.match(r.stderr, /exceeds .* limit/);
  });

  test("does not flag non-archive file <5MB", () => {
    writeFile(dir, "small.bin", Buffer.alloc(1024, 0));
    git(dir, ["add", "small.bin"]);
    const r = runGuard(dir);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("skips allow-listed attached_assets/ archive", () => {
    writeFile(dir, "attached_assets/foo.zip", "asset");
    git(dir, ["add", "attached_assets/foo.zip"]);
    const r = runGuard(dir);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("skips allow-listed downloads/ archive", () => {
    writeFile(dir, "downloads/foo.tar.gz", "asset");
    git(dir, ["add", "downloads/foo.tar.gz"]);
    const r = runGuard(dir);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("skips allow-listed steam_assets/ archive", () => {
    writeFile(dir, "steam_assets/foo.zip", "asset");
    git(dir, ["add", "steam_assets/foo.zip"]);
    const r = runGuard(dir);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("skips oversized files inside allow-listed prefixes", () => {
    writeFile(dir, "downloads/huge.bin", Buffer.alloc(7 * 1024 * 1024, 0));
    git(dir, ["add", "downloads/huge.bin"]);
    const r = runGuard(dir);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("passes when no offending files staged", () => {
    writeFile(dir, "src/index.js", 'console.log("hi")');
    git(dir, ["add", "src/index.js"]);
    const r = runGuard(dir);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("passes when nothing is staged", () => {
    const r = runGuard(dir);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("matches every archive extension in ARCHIVE_RE", () => {
    const exts = [
      "tar.gz",
      "tgz",
      "zip",
      "7z",
      "rar",
      "tar",
      "tar.bz2",
      "tar.xz",
    ];
    for (const ext of exts) {
      const subdir = initRepo();
      try {
        writeFile(subdir, `bad.${ext}`, "x");
        git(subdir, ["add", `bad.${ext}`]);
        const r = runGuard(subdir);
        assert.equal(
          r.status,
          1,
          `extension ${ext} should be flagged; stderr:\n${r.stderr}`,
        );
        assert.match(r.stderr, new RegExp(`bad\\.${ext.replace(".", "\\.")}`));
      } finally {
        rmSync(subdir, { recursive: true, force: true });
      }
    }
  });
});

describe("check-staged-archives: CI mode", () => {
  let dir;
  let baseSha;

  function commit(message) {
    git(dir, ["add", "."]);
    git(dir, ["commit", "-q", "-m", message]);
    return git(dir, ["rev-parse", "HEAD"]).trim();
  }

  beforeEach(() => {
    dir = initRepo();
    writeFile(dir, "README.md", "# initial");
    baseSha = commit("init");
  });
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("exits 0 on a clean push diff", () => {
    writeFile(dir, "src/a.js", "console.log('a')");
    const headSha = commit("add a");
    const r = runGuard(dir, {
      ci: true,
      env: {
        CHECK_ARCHIVES_BASE_SHA: baseSha,
        CHECK_ARCHIVES_HEAD_SHA: headSha,
      },
    });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("exits 1 on a violating push diff", () => {
    writeFile(dir, "evil.zip", "archive");
    const headSha = commit("add zip");
    const r = runGuard(dir, {
      ci: true,
      env: {
        CHECK_ARCHIVES_BASE_SHA: baseSha,
        CHECK_ARCHIVES_HEAD_SHA: headSha,
      },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil\.zip/);
    assert.match(r.stderr, /CI archive guard/);
  });

  test("detects PR-style violation across a feature branch", () => {
    // Simulate a PR by branching off baseSha and adding an archive there.
    git(dir, ["checkout", "-q", "-b", "feature"]);
    writeFile(dir, "evil.tar.gz", "archive");
    const headSha = commit("add archive on feature");
    const r = runGuard(dir, {
      ci: true,
      env: {
        CHECK_ARCHIVES_BASE_SHA: baseSha,
        CHECK_ARCHIVES_HEAD_SHA: headSha,
      },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil\.tar\.gz/);
  });

  test("PR-style diff ignores changes already on the base branch", () => {
    // Add an archive on main AFTER baseSha (this simulates the situation where
    // base...head three-dot semantics should ignore changes pulled in from base).
    writeFile(dir, "main-only.zip", "archive");
    commit("main adds an archive");

    // Branch off baseSha (so feature does NOT contain main-only.zip in its
    // own commits) and add a benign change.
    git(dir, ["checkout", "-q", "-b", "feature", baseSha]);
    writeFile(dir, "src/feature.js", "console.log('feature')");
    const headSha = commit("feature change");

    const r = runGuard(dir, {
      ci: true,
      env: {
        CHECK_ARCHIVES_BASE_SHA: baseSha,
        CHECK_ARCHIVES_HEAD_SHA: headSha,
      },
    });
    assert.equal(
      r.status,
      0,
      `expected exit 0 (three-dot diff should exclude base-only changes), got ${r.status}\n${r.stderr}`,
    );
  });

  test("flags an archive added then removed within the push range (transient blob)", () => {
    // Commit A adds an archive blob.
    writeFile(dir, "secrets-backup.zip", "secret data");
    const headA = commit("A: add transient archive");
    // Commit B removes it. The endpoint diff baseSha..headB is clean, but
    // git still uploads the blob in the pack — the guard must catch it.
    unlinkSync(join(dir, "secrets-backup.zip"));
    const headB = commit("B: remove transient archive");

    const r = runGuard(dir, {
      ci: true,
      env: {
        CHECK_ARCHIVES_BASE_SHA: baseSha,
        CHECK_ARCHIVES_HEAD_SHA: headB,
      },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /secrets-backup\.zip/);
    assert.match(r.stderr, /CI archive guard/);
    // Sanity: the intermediate commit was real.
    assert.notEqual(headA, headB);
  });

  test("CI mode honors allow-listed prefixes", () => {
    writeFile(dir, "attached_assets/legit.zip", "asset");
    const headSha = commit("add legit asset");
    const r = runGuard(dir, {
      ci: true,
      env: {
        CHECK_ARCHIVES_BASE_SHA: baseSha,
        CHECK_ARCHIVES_HEAD_SHA: headSha,
      },
    });
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("empty-tree base scans every file at HEAD (orphan/initial push fallback)", () => {
    writeFile(dir, "evil.zip", "archive");
    const headSha = commit("add zip");
    const r = runGuard(dir, {
      ci: true,
      env: {
        CHECK_ARCHIVES_BASE_SHA: EMPTY_TREE_SHA,
        CHECK_ARCHIVES_HEAD_SHA: headSha,
      },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil\.zip/);
  });

  test("errors when base SHA is the zero SHA", () => {
    const r = runGuard(dir, {
      ci: true,
      env: {
        CHECK_ARCHIVES_BASE_SHA: ZERO_SHA,
        CHECK_ARCHIVES_HEAD_SHA: baseSha,
      },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /zero SHA/);
  });

  test("errors when CHECK_ARCHIVES_*_SHA env vars are missing", () => {
    const r = runGuard(dir, { ci: true, env: {} });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /CHECK_ARCHIVES_BASE_SHA/);
  });

  test("fails closed when the resolved range references an unknown ref", () => {
    // Both env SHAs look real and pass the local-existence preflight (we
    // pass `baseSha` for both), but we then point the script at a corrupt
    // setup by hand-rewriting the head SHA to a plausible-but-missing one
    // via env override. The internal `git log` call must surface the error
    // instead of silently scanning nothing.
    const r = spawnSync(process.execPath, [SCRIPT, "--ci"], {
      cwd: dir,
      encoding: "utf8",
      env: buildEnv({
        CHECK_ARCHIVES_BASE_SHA: baseSha,
        // Plausible-shaped SHA that does not exist in the repo. Because head
        // is not preflighted (only base is), this exercises the per-commit
        // walk's error path directly.
        CHECK_ARCHIVES_HEAD_SHA: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      }),
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /failed to compute diff/);
  });

  test("errors when base commit is not present in local repo", () => {
    const r = runGuard(dir, {
      ci: true,
      env: {
        // Plausible-shaped SHA that does not exist in the repo.
        CHECK_ARCHIVES_BASE_SHA: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        CHECK_ARCHIVES_HEAD_SHA: baseSha,
      },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /not present in the local repo/);
  });

  test("CHECK_ARCHIVES_CI=1 enables CI mode without --ci flag", () => {
    writeFile(dir, "evil.zip", "archive");
    const headSha = commit("add zip");
    const r = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      env: buildEnv({
        CHECK_ARCHIVES_CI: "1",
        CHECK_ARCHIVES_BASE_SHA: baseSha,
        CHECK_ARCHIVES_HEAD_SHA: headSha,
      }),
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil\.zip/);
  });
});

describe("check-staged-archives: pre-push mode", () => {
  let dir;
  let baseSha;

  function commit(message) {
    git(dir, ["add", "."]);
    git(dir, ["commit", "-q", "-m", message]);
    return git(dir, ["rev-parse", "HEAD"]).trim();
  }

  function runPush(stdin, { env = {} } = {}) {
    return spawnSync(process.execPath, [SCRIPT, "--pre-push"], {
      cwd: dir,
      encoding: "utf8",
      input: stdin,
      env: buildEnv(env),
    });
  }

  beforeEach(() => {
    dir = initRepo();
    writeFile(dir, "README.md", "# initial");
    baseSha = commit("init");
  });
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("exits 0 on empty stdin (nothing to push)", () => {
    const r = runPush("");
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("exits 0 when ref is being deleted (local sha is zero)", () => {
    const stdin = `(delete) ${ZERO_SHA} refs/heads/old ${baseSha}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("exits 0 on a clean push to an existing remote ref", () => {
    writeFile(dir, "src/a.js", "console.log('a')");
    const headSha = commit("add a");
    const stdin = `refs/heads/main ${headSha} refs/heads/main ${baseSha}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("exits 1 when an existing-ref push contains an archive", () => {
    writeFile(dir, "evil.zip", "archive");
    const headSha = commit("add zip");
    const stdin = `refs/heads/main ${headSha} refs/heads/main ${baseSha}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil\.zip/);
    assert.match(r.stderr, /Refusing to push/);
    assert.match(r.stderr, /git push --no-verify/);
  });

  test("exits 1 when a >5MB non-archive file would be pushed", () => {
    writeFile(dir, "big.bin", Buffer.alloc(6 * 1024 * 1024, 0));
    const headSha = commit("add big");
    const stdin = `refs/heads/main ${headSha} refs/heads/main ${baseSha}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /big\.bin/);
    assert.match(r.stderr, /exceeds .* limit/);
  });

  test("--no-verify equivalent: hook bypassed entirely (we just confirm the failure path uses the pre-push banner, not the pre-commit one)", () => {
    writeFile(dir, "evil.tar.gz", "archive");
    const headSha = commit("add archive");
    const stdin = `refs/heads/main ${headSha} refs/heads/main ${baseSha}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Refusing to push/);
    assert.doesNotMatch(r.stderr, /Refusing to commit/);
  });

  test("new ref with no remote-tracking branches: scans every file at HEAD", () => {
    writeFile(dir, "evil.tar.gz", "archive");
    const headSha = commit("add archive");
    const stdin = `refs/heads/main ${headSha} refs/heads/main ${ZERO_SHA}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil\.tar\.gz/);
  });

  test("new ref with existing remote-tracking branch: only flags branch's own commits", () => {
    // Pretend origin/main is at baseSha (where main also is, currently).
    git(dir, ["update-ref", "refs/remotes/origin/main", baseSha]);

    // Branch off baseSha and add a violating commit only on the feature branch.
    git(dir, ["checkout", "-q", "-b", "feature"]);
    writeFile(dir, "evil.tar.gz", "archive");
    const headSha = commit("add archive on feature");

    const stdin = `refs/heads/feature ${headSha} refs/heads/feature ${ZERO_SHA}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil\.tar\.gz/);
  });

  test("new ref ignores violations already reachable from the remote", () => {
    // Add an archive on main and pretend the remote already has it.
    writeFile(dir, "main-only.zip", "archive");
    const mainHead = commit("main adds an archive");
    git(dir, ["update-ref", "refs/remotes/origin/main", mainHead]);

    // Now branch off mainHead and add a benign change.
    git(dir, ["checkout", "-q", "-b", "feature", mainHead]);
    writeFile(dir, "src/feature.js", "console.log('feature')");
    const headSha = commit("benign feature change");

    const stdin = `refs/heads/feature ${headSha} refs/heads/feature ${ZERO_SHA}\n`;
    const r = runPush(stdin);
    assert.equal(
      r.status,
      0,
      `expected exit 0 (the archive was already on the remote), got ${r.status}\n${r.stderr}`,
    );
  });

  test("flags an archive added then removed within the push range (transient blob)", () => {
    // Commit A adds an archive blob; commit B removes it. The endpoint diff
    // baseSha..headB shows no surviving archive at HEAD, but git uploads the
    // blob anyway in the pack, so the pre-push hook must reject the push.
    writeFile(dir, "secrets-backup.zip", "secret data");
    const headA = commit("A: add transient archive");
    unlinkSync(join(dir, "secrets-backup.zip"));
    const headB = commit("B: remove transient archive");

    const stdin = `refs/heads/main ${headB} refs/heads/main ${baseSha}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /secrets-backup\.zip/);
    assert.match(r.stderr, /Refusing to push/);
    // Sanity: A and B are distinct commits inside the push range.
    assert.notEqual(headA, headB);
  });

  test("flags transient archive on a feature branch's own commits (new ref push)", () => {
    // Pretend origin/main is at baseSha so the feature branch's commits are
    // the only ones unique to this push.
    git(dir, ["update-ref", "refs/remotes/origin/main", baseSha]);
    git(dir, ["checkout", "-q", "-b", "feature"]);

    writeFile(dir, "leak.tar.gz", "data");
    const headA = commit("A: add transient archive on feature");
    unlinkSync(join(dir, "leak.tar.gz"));
    const headB = commit("B: remove it");

    const stdin = `refs/heads/feature ${headB} refs/heads/feature ${ZERO_SHA}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /leak\.tar\.gz/);
    assert.notEqual(headA, headB);
  });

  test("honors allow-listed prefixes during push", () => {
    writeFile(dir, "attached_assets/legit.zip", "asset");
    const headSha = commit("add legit asset");
    const stdin = `refs/heads/main ${headSha} refs/heads/main ${baseSha}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("aggregates violations across multiple pushed refs", () => {
    git(dir, ["checkout", "-q", "-b", "feature1", baseSha]);
    writeFile(dir, "evil1.zip", "x");
    const head1 = commit("evil1");

    git(dir, ["checkout", "-q", "-b", "feature2", baseSha]);
    writeFile(dir, "evil2.tar.gz", "x");
    const head2 = commit("evil2");

    const stdin =
      `refs/heads/feature1 ${head1} refs/heads/feature1 ${ZERO_SHA}\n` +
      `refs/heads/feature2 ${head2} refs/heads/feature2 ${ZERO_SHA}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil1\.zip/);
    assert.match(r.stderr, /evil2\.tar\.gz/);
    // Each violation is annotated with the local ref it came from.
    assert.match(r.stderr, /refs\/heads\/feature1/);
    assert.match(r.stderr, /refs\/heads\/feature2/);
  });

  test("malformed stdin lines are ignored, not treated as fatal", () => {
    writeFile(dir, "src/a.js", "console.log('a')");
    const headSha = commit("add a");
    const stdin =
      `not enough fields\n` +
      `refs/heads/main ${headSha} refs/heads/main ${baseSha}\n`;
    const r = runPush(stdin);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  });

  test("CHECK_ARCHIVES_PRE_PUSH=1 enables pre-push mode without --pre-push flag", () => {
    writeFile(dir, "evil.zip", "archive");
    const headSha = commit("add zip");
    const stdin = `refs/heads/main ${headSha} refs/heads/main ${baseSha}\n`;
    const r = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      input: stdin,
      env: buildEnv({ CHECK_ARCHIVES_PRE_PUSH: "1" }),
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /evil\.zip/);
    assert.match(r.stderr, /Refusing to push/);
  });
});
