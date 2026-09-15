#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const MAX_BYTES = 5 * 1024 * 1024;
const ARCHIVE_RE = /\.(tar\.gz|tgz|zip|7z|rar|tar|tar\.bz2|tar\.xz)$/i;

const ALLOW_PREFIXES = [
  "attached_assets/",
  "downloads/",
  "steam_assets/",
];

const ZERO_SHA = "0000000000000000000000000000000000000000";
// Git's well-known empty-tree object. Useful as a "diff against nothing" base
// for orphan branches / first-commit pushes so every present file is treated
// as an addition.
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function isAllowListed(path) {
  return ALLOW_PREFIXES.some((p) => path === p.slice(0, -1) || path.startsWith(p));
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function splitLines(out) {
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function getStagedFiles() {
  return splitLines(git(["diff", "--cached", "--name-only", "--diff-filter=AM"]));
}

// Sentinel that prefixes commit-hash header lines in `git log --pretty=format`
// output. We use a literal string (not whitespace / NUL) so the line survives
// trim() and is unambiguous against any plausible filename.
const COMMIT_HEADER = "===COMMIT===";

function listPushedFilePairs(revArgs) {
  // Walk every commit selected by `revArgs` (e.g. ["base..head"] or
  // [head, "--not", "--remotes"]) and emit one {commit, rel} pair per file
  // that the commit added or modified. This is deliberately per-commit, not a
  // single endpoint diff, so that a blob added by commit A and removed by
  // commit B in the same range is still flagged — the blob is uploaded in the
  // pack regardless of whether HEAD's tree still references it.
  //
  // We let git failures propagate so callers can fail closed with context
  // (a missing or unresolvable ref must not silently skip the scan and
  // accidentally let a violating push through).
  const out = git([
    "log",
    "--name-only",
    "--no-renames",
    "--diff-filter=AM",
    `--pretty=format:${COMMIT_HEADER}%H`,
    ...revArgs,
  ]);

  const pairs = [];
  let currentCommit = null;
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(COMMIT_HEADER)) {
      currentCommit = line.slice(COMMIT_HEADER.length);
      continue;
    }
    if (currentCommit) pairs.push({ commit: currentCommit, rel: line });
  }
  return pairs;
}

function getCiChangedFiles(base, head) {
  if (base === EMPTY_TREE_SHA) {
    // Orphan / initial-push fallback: walk every commit reachable from head
    // and treat each commit's added/modified files as candidates, sizing them
    // at the commit they first appeared in.
    return listPushedFilePairs([head]);
  }
  // PR-style semantics: enumerate commits reachable from head but not base
  // (the head-side of the previous three-dot diff), then per-commit walk
  // files so transient adds inside the range are still caught.
  return listPushedFilePairs([`${base}..${head}`]);
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(2) + " KB";
  return n + " B";
}

function getFileSizeAtRef(rel, ref) {
  try {
    const out = git(["cat-file", "-s", `${ref}:${rel}`]);
    const n = parseInt(out.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function fail(msg) {
  console.error(`[check-staged-archives] ${msg}`);
  process.exit(1);
}

function readStdinSync() {
  // File descriptor 0 is stdin. readFileSync handles the synchronous read for
  // small inputs (the pre-push protocol is one short line per pushed ref).
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parsePrePushStdin(text) {
  // Per githooks(5) pre-push protocol, each line is:
  //   <local ref> <local oid> <remote ref> <remote oid>
  // Empty stdin = nothing to push (we exit cleanly).
  const refs = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    const [localRef, localSha, remoteRef, remoteSha] = parts;
    refs.push({ localRef, localSha, remoteRef, remoteSha });
  }
  return refs;
}

function getPushRangeFiles(localSha, remoteSha) {
  // For an existing remote ref, the commits being pushed are exactly
  // remoteSha..localSha — walk them per-commit so a transient archive blob
  // (added in commit A, removed in commit B, both within the range) is still
  // caught. The endpoint diff alone would miss it because the tree at
  // localSha no longer references the file, but the blob is still in the pack
  // git uploads to the remote.
  if (remoteSha !== ZERO_SHA) {
    return listPushedFilePairs([`${remoteSha}..${localSha}`]);
  }

  // New ref on the remote: figure out which commits this push actually adds by
  // excluding everything already reachable from any remote-tracking branch.
  let commits = null;
  try {
    commits = splitLines(git(["rev-list", localSha, "--not", "--remotes"]));
  } catch {
    commits = null;
  }

  if (!commits) {
    // No remote-tracking refs at all (fresh clone-less init, etc.). Treat
    // every commit reachable from HEAD as part of the push — same fallback
    // CI uses for the empty-tree base case.
    return listPushedFilePairs([localSha]);
  }

  if (commits.length === 0) {
    // Push is a no-op (everything is already on the remote).
    return [];
  }

  // Walk only the commits unique to this push, per-commit, so transient adds
  // inside the branch's own history are also flagged.
  return listPushedFilePairs([localSha, "--not", "--remotes"]);
}

function resolveCiRange() {
  const base = process.env.CHECK_ARCHIVES_BASE_SHA || "";
  const head = process.env.CHECK_ARCHIVES_HEAD_SHA || "";

  if (!base || !head) {
    fail(
      "CI mode requires CHECK_ARCHIVES_BASE_SHA and CHECK_ARCHIVES_HEAD_SHA env vars. " +
        "Set them from your CI event (e.g. github.event.pull_request.base.sha / github.event.before).",
    );
  }

  if (base === ZERO_SHA) {
    fail(
      "CHECK_ARCHIVES_BASE_SHA is the zero SHA. Resolve a real base commit in the CI workflow " +
        "(for an initial push, use the root commit: git rev-list --max-parents=0 HEAD | tail -n1).",
    );
  }

  if (base !== EMPTY_TREE_SHA) {
    let baseExists = true;
    try {
      git(["cat-file", "-e", `${base}^{commit}`]);
    } catch {
      baseExists = false;
    }

    if (!baseExists) {
      fail(
        `Base commit ${base} is not present in the local repo. Make sure the CI checkout uses ` +
          `fetch-depth: 0 (or otherwise fetches the base ref) before running the archive guard.`,
      );
    }
  }

  return { base, head };
}

function classify(rel, size) {
  if (ARCHIVE_RE.test(rel)) {
    return { reason: "archive file extension" };
  }
  if (size > MAX_BYTES) {
    return { reason: `file exceeds ${fmtBytes(MAX_BYTES)} limit` };
  }
  return null;
}

function sizeFromRefOrDisk(rel, ref) {
  let size = ref ? getFileSizeAtRef(rel, ref) : 0;
  if (size === 0) {
    try {
      size = statSync(resolve(process.cwd(), rel)).size;
    } catch {
      return null;
    }
  }
  return size;
}

function printBanner({ mode, violations }) {
  const headlines = {
    "pre-commit": "\u274C  Refusing to commit large/backup archive files:",
    "pre-push": "\u274C  Refusing to push large/backup archive files:",
    ci: "\u274C  CI archive guard: refusing to accept large/backup archive files in this change:",
  };

  console.error("");
  console.error(headlines[mode]);
  console.error("");

  // De-dupe by (rel, reason) — the same file can appear via multiple pushed refs.
  const seen = new Set();
  for (const v of violations) {
    const key = `${v.rel}|${v.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const refLabel = v.ref ? `  [${v.ref}]` : "";
    console.error(`  - ${v.rel}  (${fmtBytes(v.size)})  -  ${v.reason}${refLabel}`);
  }
  console.error("");
  console.error("These files look like backups, exports, or oversized binaries.");
  console.error("Allowed locations for legitimate large/archive assets:");
  for (const p of ALLOW_PREFIXES) console.error(`  - ${p}`);
  console.error("");

  if (mode === "ci") {
    console.error("Remove the offending files from this branch (or move them under one");
    console.error("of the allow-listed directories above) and push again.");
  } else if (mode === "pre-push") {
    console.error("Remove the offending files from the commits you're pushing (or move");
    console.error("them under one of the allow-listed directories above) and push again.");
    console.error("To bypass once (not recommended; CI will still reject), use:");
    console.error("  git push --no-verify");
  } else {
    console.error("If this file truly belongs in the repo, move it under one of");
    console.error("the allow-listed directories above. Otherwise, delete it and");
    console.error("rebuild on demand. To bypass once (not recommended), use:");
    console.error("  git commit --no-verify");
  }
  console.error("");
}

function runPrePush() {
  const stdin = readStdinSync();
  const refs = parsePrePushStdin(stdin);
  if (refs.length === 0) process.exit(0);

  const violations = [];

  for (const ref of refs) {
    // localSha === ZERO_SHA means the ref is being deleted — no content
    // is being uploaded, so there's nothing for us to scan.
    if (ref.localSha === ZERO_SHA) continue;

    let pairs;
    try {
      pairs = getPushRangeFiles(ref.localSha, ref.remoteSha);
    } catch (err) {
      fail(
        `failed to compute push range for ${ref.localRef} (${ref.remoteSha}..${ref.localSha}): ${err.message}`,
      );
    }

    for (const { commit, rel } of pairs) {
      if (isAllowListed(rel)) continue;
      // Size the file at the commit that introduced/modified it, not at
      // ref.localSha — otherwise a file added in commit A and deleted in
      // commit B would size as 0 at HEAD and slip through.
      const size = sizeFromRefOrDisk(rel, commit);
      if (size === null) continue;
      const verdict = classify(rel, size);
      if (verdict) {
        violations.push({ rel, size, reason: verdict.reason, ref: ref.localRef });
      }
    }
  }

  if (violations.length === 0) process.exit(0);

  printBanner({ mode: "pre-push", violations });
  process.exit(1);
}

function runCi() {
  const range = resolveCiRange();
  let pairs;
  try {
    pairs = getCiChangedFiles(range.base, range.head);
  } catch (err) {
    fail(`failed to compute diff ${range.base}...${range.head}: ${err.message}`);
  }

  if (!pairs || pairs.length === 0) process.exit(0);

  const violations = [];
  for (const { commit, rel } of pairs) {
    if (isAllowListed(rel)) continue;
    // Size at the commit that added/modified the file, not at range.head —
    // otherwise a transient blob (added then removed within the range) sizes
    // as 0 at head and slips through, even though git still uploads it.
    const size = sizeFromRefOrDisk(rel, commit);
    if (size === null) continue;
    const verdict = classify(rel, size);
    if (verdict) violations.push({ rel, size, reason: verdict.reason });
  }

  if (violations.length === 0) process.exit(0);

  printBanner({ mode: "ci", violations });
  process.exit(1);
}

function runPreCommit() {
  let files;
  try {
    files = getStagedFiles();
  } catch (err) {
    console.error("[check-staged-archives] git not available:", err.message);
    process.exit(0);
  }

  if (!files || files.length === 0) process.exit(0);

  const violations = [];
  for (const rel of files) {
    if (isAllowListed(rel)) continue;
    const size = sizeFromRefOrDisk(rel, null);
    if (size === null) continue;
    const verdict = classify(rel, size);
    if (verdict) violations.push({ rel, size, reason: verdict.reason });
  }

  if (violations.length === 0) process.exit(0);

  printBanner({ mode: "pre-commit", violations });
  process.exit(1);
}

function main() {
  const isPrePush =
    process.argv.includes("--pre-push") || process.env.CHECK_ARCHIVES_PRE_PUSH === "1";
  const isCi = process.argv.includes("--ci") || process.env.CHECK_ARCHIVES_CI === "1";

  if (isPrePush) return runPrePush();
  if (isCi) return runCi();
  return runPreCommit();
}

main();
