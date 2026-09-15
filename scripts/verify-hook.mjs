#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, isAbsolute, join } from "node:path";

const GUARD_MARKER = "check-staged-archives.mjs";
// Both hooks invoke the same guard script — the pre-commit hook scans staged
// changes, the pre-push hook re-scans the commits being uploaded so a
// `git commit --no-verify` slip-up still gets caught before it leaves the
// machine. Each hook lists the substrings its content MUST contain; this
// catches the case where the pre-push hook was overwritten (or copy-pasted
// from pre-commit) and silently runs in pre-commit mode against an unrelated
// staging area on push, producing zero coverage.
const HOOKS = [
  { name: "pre-commit", markers: [GUARD_MARKER] },
  { name: "pre-push", markers: [GUARD_MARKER, "--pre-push"] },
];
const FIX_COMMAND = "pnpm exec simple-git-hooks";
const DOCTOR_COMMAND = "pnpm run doctor:hooks";

const args = new Set(process.argv.slice(2));
const isPostinstall = args.has("--postinstall");
const isWindows = process.platform === "win32";

function logInfo(msg) {
  process.stderr.write(`[doctor:hooks] ${msg}\n`);
}

function printFailBanner({ hookName, reason, hookPath, extra }) {
  const lines = [];
  lines.push("");
  lines.push(
    `\u274C  doctor:hooks FAIL — repo-hygiene ${hookName} hook is NOT installed.`,
  );
  lines.push("");
  lines.push(`  Reason : ${reason}`);
  if (hookPath) lines.push(`  Path   : ${hookPath}`);
  if (extra) lines.push(`  Detail : ${extra}`);
  lines.push("");
  lines.push("  Why this matters:");
  lines.push("    Without these hooks, you can accidentally commit or push backup");
  lines.push("    archives or oversized binaries. CI will still reject them, but");
  lines.push("    only after a push and a wasted round-trip.");
  lines.push("");
  lines.push("  Fix it now:");
  lines.push(`    ${FIX_COMMAND}`);
  lines.push(`    ${DOCTOR_COMMAND}`);
  lines.push("");
  lines.push("  If hooks are intentionally disabled in this checkout, set");
  lines.push("  SKIP_VERIFY_HOOK=1 to silence this check (CI still enforces the rule).");
  lines.push("");
  process.stderr.write(lines.join("\n"));
}

function printPass(hookName, hookPath) {
  process.stdout.write(
    `\u2705  doctor:hooks PASS — ${hookName} hook installed at ${hookPath}\n`,
  );
}

function tryGit(args, cwd = process.cwd()) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function detectRepoRoot() {
  return tryGit(["rev-parse", "--show-toplevel"]);
}

function detectHooksDir(repoRoot) {
  // git rev-parse --git-path hooks resolves core.hooksPath when set, falling
  // back to <gitdir>/hooks otherwise. Returns a path relative to cwd or
  // absolute; normalize against the repo root.
  const raw = tryGit(["rev-parse", "--git-path", "hooks"], repoRoot);
  if (!raw) return null;
  return isAbsolute(raw) ? raw : resolve(repoRoot, raw);
}

function isExecutable(path) {
  if (isWindows) return true; // executable bit is not meaningful on Windows
  try {
    const mode = statSync(path).mode;
    return (mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function tryInstallHook(repoRoot) {
  // Best-effort: run simple-git-hooks to lay down the hooks. Swallow errors —
  // the verification step below is the source of truth.
  const result = spawnSync("pnpm", ["exec", "simple-git-hooks"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function checkHook(hooksDir, hook) {
  const hookPath = join(hooksDir, hook.name);

  let content = null;
  if (existsSync(hookPath)) {
    try {
      content = readFileSync(hookPath, "utf8");
    } catch (err) {
      return {
        ok: false,
        hook,
        hookPath,
        reason: `${hook.name} hook file exists but could not be read`,
        extra: err.message,
      };
    }
  }

  if (content === null) {
    return {
      ok: false,
      hook,
      hookPath,
      reason: `no ${hook.name} hook file found`,
      extra:
        "simple-git-hooks did not write the hook (was pnpm install run, or did a different package manager skip the postinstall script?)",
    };
  }

  const missingMarker = hook.markers.find((m) => !content.includes(m));
  if (missingMarker) {
    return {
      ok: false,
      hook,
      hookPath,
      reason:
        missingMarker === GUARD_MARKER
          ? `${hook.name} hook does not invoke ${GUARD_MARKER}`
          : `${hook.name} hook is missing required argument: ${missingMarker}`,
      extra:
        "another tool may have overwritten the hook (or someone hand-edited it and dropped the flag). Re-run the fix command to reinstate it.",
    };
  }

  if (!isExecutable(hookPath)) {
    return {
      ok: false,
      hook,
      hookPath,
      reason: `${hook.name} hook is not executable`,
      extra: "git will silently ignore non-executable hooks on POSIX systems.",
    };
  }

  return { ok: true, hook, hookPath };
}

function verify({ allowInstall }) {
  if (process.env.SKIP_VERIFY_HOOK === "1") {
    if (!isPostinstall) logInfo("SKIP_VERIFY_HOOK=1 is set; skipping verification.");
    return 0;
  }

  const repoRoot = detectRepoRoot();
  if (!repoRoot) {
    // Not a git checkout (e.g. tarball install in CI). Nothing to verify.
    if (!isPostinstall) {
      logInfo("not a git checkout; nothing to verify (skipped).");
    }
    return 0;
  }

  const hooksDir = detectHooksDir(repoRoot);
  if (!hooksDir) {
    printFailBanner({
      hookName: "pre-commit",
      reason: "could not resolve git hooks directory",
      extra: "git rev-parse --git-path hooks returned nothing",
    });
    return 1;
  }

  let results = HOOKS.map((h) => checkHook(hooksDir, h));

  if (allowInstall && results.some((r) => !r.ok)) {
    // Postinstall path: try to install the hooks ourselves before declaring failure.
    tryInstallHook(repoRoot);
    results = HOOKS.map((h) => checkHook(hooksDir, h));
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    for (const f of failed) {
      printFailBanner({
        hookName: f.hook.name,
        reason: f.reason,
        hookPath: f.hookPath,
        extra: f.extra,
      });
    }
    return 1;
  }

  if (!isPostinstall) {
    for (const r of results) printPass(r.hook.name, r.hookPath);
  }
  return 0;
}

const code = verify({ allowInstall: isPostinstall });
process.exit(code);
