#!/usr/bin/env python3
"""Rebuild the three downloadable Steam deliverables in dist-download/.

One reliable step to run after a game version bump or content change, once
steam/web-build/ holds a fresh `expo export` that has already been through
inline-fonts.mjs and flatten-assets.mjs:

    python3 steam/scripts/repack-deliverables.py        (from artifacts/megacity)

What it does, in order:
  0. Syncs steam/package.json "version" to the app version in package.json,
     so the version stamp inside the Windows build can never be forgotten.
  1. Preflight: verifies steam/web-build is a flattened export (entry-*.js
     present, zero __node_modules paths, longest internal path < 260 chars)
     and that the previous deliverables exist (runtime entries and the
     uploader script are carried over from them).
  2. megacity-desktop-windows.zip — keeps every Electron runtime entry from
     the existing Windows zip (everything outside resources/app/), then adds
     every APP_FILES entry fresh from steam/ (APP_FILES below is the single
     source of truth — a preflight scan fails loudly if any packed shell .js
     file requires a local module that is not in the list) plus
     resources/app/web-build/ from steam/web-build.
  3. megacity-steam-build-kit.zip — zips the whole steam/ dir under a steam/
     prefix, excluding node_modules/dist/output/web-build-new, the stale
     MEGACITY-web-build-fixed.zip, and temp files.
   4. megacity-steam-uploader.zip — exactly 5 entries under the
     megacity-steam-uploader/ prefix: the fresh Windows zip nested with
      ZIP_STORED (no double compression), plus START-UPLOAD.cmd,
      upload-to-steam.ps1 and
     README.txt from their source of truth at steam/uploader/ (falls back
     to carrying them over from the existing uploader zip only if that
     directory is ever missing), plus release-manifest.json.
  5. Post-verify: reopens all three zips and checks entry hash, version
     stamps, path limits, and uploader structure. Fails loudly on any drift.

Every zip is written to <name>.tmp.zip first and moved into place with
os.replace, so a crash mid-run never corrupts an existing deliverable.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import zipfile
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
STEAM = SCRIPT_DIR.parent
ROOT = STEAM.parent
DIST = ROOT / "dist-download"

WINDOWS_ZIP = DIST / "megacity-desktop-windows.zip"
KIT_ZIP = DIST / "megacity-steam-build-kit.zip"
UPLOADER_ZIP = DIST / "megacity-steam-uploader.zip"

UPLOADER_PREFIX = "megacity-steam-uploader/"
MANIFEST_NAME = "release-manifest.json"
MANIFEST_PATH = STEAM / MANIFEST_NAME
UPLOADER_FILES = ["START-UPLOAD.cmd", "upload-to-steam.ps1", "README.txt"]
APP_FILES = [
    "main.js",
    "preload.js",
    "closeGuard.js",
    "releaseIntegrity.js",
    "icon.png",
    "steam_appid.txt",
    "package.json",
]
MAX_WINDOWS_PATH = 260

# Every packed .js shell file has its relative require()s scanned; the scan
# list is derived from APP_FILES so the two can never drift apart. main.js
# once grew a require("./closeGuard") that was not in APP_FILES, and the
# packed build crashed at launch with "Cannot find module".
_REQUIRE_RE = re.compile(r"""require\(\s*["']\.\.?/([^"')]+)["']\s*\)""")


def check_local_requires() -> None:
    """Fail if any relative require() in the packed shell .js files is not packed."""
    scan_files = [f for f in APP_FILES if f.endswith(".js")]
    packed = set(APP_FILES)
    missing: list[str] = []
    for src_name in scan_files:
        src = STEAM / src_name
        if not src.is_file():
            continue
        for match in _REQUIRE_RE.finditer(src.read_text()):
            mod = match.group(1)
            candidates = [mod] if mod.endswith(".js") else [mod + ".js", mod + "/index.js"]
            if not any(c in packed for c in candidates):
                missing.append(f"{src_name} requires ./{mod} but none of {candidates} is in APP_FILES")
    if missing:
        fail(
            "local require() targets missing from APP_FILES — the packed app would "
            "crash at launch with 'Cannot find module':\n      " + "\n      ".join(missing)
        )
    print(f"    local requires ok: {len(scan_files)} shell files scanned, all targets packed")

# Excluded from the build kit: build outputs, caches, temp files, and the
# stale MEGACITY-web-build-fixed.zip (a redundant second copy of web-build/
# that roughly doubles the kit size).
KIT_EXCLUDED_DIRS = {"node_modules", "dist", "output", "web-build-new"}
KIT_EXCLUDED_FILES = {"MEGACITY-web-build-fixed.zip"}


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def step(msg: str) -> float:
    print(f"==> {msg}", flush=True)
    return time.monotonic()


def done(t0: float) -> None:
    print(f"    done in {time.monotonic() - t0:.1f}s", flush=True)


def sync_steam_package_version() -> str:
    """Stamp the app version from package.json into steam/package.json."""
    app_version = json.loads((ROOT / "package.json").read_text())["version"]
    steam_pkg_path = STEAM / "package.json"
    text = steam_pkg_path.read_text()
    steam_version = json.loads(text)["version"]
    if steam_version != app_version:
        new_text, n = re.subn(
            r'("version"\s*:\s*")[^"]+(")',
            rf"\g<1>{app_version}\g<2>",
            text,
            count=1,
        )
        if n != 1:
            fail("could not find a \"version\" field in steam/package.json to update")
        steam_pkg_path.write_text(new_text)
        print(f"    stamped steam/package.json version {steam_version} -> {app_version}")
    else:
        print(f"    steam/package.json already at app version {app_version}")
    return app_version


def bundle_sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def write_release_manifest(app_version: str, entry_name: str) -> dict:
    """Record the exact immutable payload that the deliverables will contain."""
    entry_path = STEAM / "web-build" / "_expo" / "static" / "js" / "web" / entry_name
    try:
        existing_manifest = json.loads(MANIFEST_PATH.read_text())
        fixture_markers = existing_manifest["fixtureMarkers"]
        windows_release = existing_manifest["windowsRelease"]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        fail(
            f"{MANIFEST_PATH} must define fixtureMarkers and windowsRelease "
            f"before repacking: {exc}"
        )
    if (
        not isinstance(fixture_markers, dict)
        or not fixture_markers
        or any(
            not isinstance(name, str)
            or not name
            or not isinstance(marker, str)
            or not marker
            for name, marker in fixture_markers.items()
        )
    ):
        fail(f"{MANIFEST_PATH} fixtureMarkers must be a non-empty object of strings")
    if (
        not isinstance(windows_release, dict)
        or not isinstance(windows_release.get("runnerLabels"), list)
        or not windows_release["runnerLabels"]
        or any(not isinstance(label, str) or not label for label in windows_release["runnerLabels"])
        or not isinstance(windows_release.get("executable"), str)
        or not windows_release["executable"]
    ):
        fail(
            f"{MANIFEST_PATH} windowsRelease must define non-empty runnerLabels "
            "and executable"
        )

    generated_at = datetime.now(timezone.utc) \
        .replace(microsecond=0).isoformat().replace("+00:00", "Z")
    # Inventory only immutable shipped resources. User data is kept outside
    # resources/app, and this manifest is intentionally excluded to avoid a
    # self-reference. Paths use POSIX separators for portable verification.
    web_build = STEAM / "web-build"
    integrity_files = [
        (name, STEAM / name)
        for name in APP_FILES
    ] + [
        ("web-build/" + p.relative_to(web_build).as_posix(), p)
        for p in sorted(web_build.rglob("*")) if p.is_file()
    ]
    files = [
        {
            "path": rel,
            "size": file_path.stat().st_size,
            "sha256": bundle_sha256(file_path),
        }
        for rel, file_path in sorted(integrity_files)
    ]
    manifest = {
        "manifestVersion": 1,
        "appVersion": app_version,
        "buildId": generated_at,
        "entryBundle": entry_name,
        "bundleSha256": bundle_sha256(entry_path),
        "files": files,
        "fixtureMarkers": fixture_markers,
        "windowsRelease": windows_release,
        "generatedAt": generated_at,
    }
    tmp = MANIFEST_PATH.with_suffix(".tmp.json")
    try:
        tmp.write_text(json.dumps(manifest, indent=2) + "\n")
        os.replace(tmp, MANIFEST_PATH)
    finally:
        if tmp.exists():
            tmp.unlink()
    print(
        f"    release manifest: v{manifest['appVersion']}, {manifest['entryBundle']}, "
        f"sha256 {manifest['bundleSha256']}"
    )
    return manifest


def load_release_manifest(require_integrity: bool = False) -> dict:
    if not MANIFEST_PATH.is_file():
        fail(f"{MANIFEST_PATH} missing — the bundle has not been recorded")
    try:
        manifest = json.loads(MANIFEST_PATH.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"could not read {MANIFEST_PATH}: {exc}")
    required = ["appVersion", "entryBundle", "bundleSha256", "generatedAt"]
    if require_integrity:
        required.append("buildId")
    if not isinstance(manifest, dict) or any(
        not isinstance(manifest.get(key), str) or not manifest[key] for key in required
    ):
        fail(f"{MANIFEST_PATH} must contain non-empty string fields: {', '.join(required)}")
    fixture_markers = manifest.get("fixtureMarkers")
    if (
        not isinstance(fixture_markers, dict)
        or not fixture_markers
        or any(
            not isinstance(name, str)
            or not name
            or not isinstance(marker, str)
            or not marker
            for name, marker in fixture_markers.items()
        )
    ):
        fail(f"{MANIFEST_PATH} fixtureMarkers must be a non-empty object of strings")
    if not re.fullmatch(r"[0-9a-f]{64}", manifest["bundleSha256"]):
        fail(f"{MANIFEST_PATH} bundleSha256 must be a lowercase SHA-256 digest")
    if require_integrity:
        if manifest.get("manifestVersion") != 1:
            fail(f"{MANIFEST_PATH} manifestVersion must be 1")
        files = manifest.get("files")
        if not isinstance(files, list) or not files:
            fail(f"{MANIFEST_PATH} files must be a non-empty array")
        previous = None
        seen = set()
        for entry in files:
            if not isinstance(entry, dict):
                fail(f"{MANIFEST_PATH} files entries must be objects")
            rel = entry.get("path")
            if (
                not isinstance(rel, str)
                or not rel
                or "\\" in rel
                or rel.startswith("/")
                or any(part in ("", ".", "..") for part in rel.split("/"))
                or (previous is not None and rel <= previous)
                or rel in seen
                or not isinstance(entry.get("size"), int)
                or entry["size"] < 0
                or not re.fullmatch(r"[0-9a-f]{64}", entry.get("sha256", ""))
            ):
                fail(f"{MANIFEST_PATH} contains an invalid, unsorted, or duplicate file entry")
            previous = rel
            seen.add(rel)
    try:
        datetime.fromisoformat(manifest["generatedAt"].replace("Z", "+00:00"))
    except ValueError:
        fail(f"{MANIFEST_PATH} generatedAt must be an ISO-8601 timestamp")
    return manifest


def preflight() -> tuple[list[Path], str]:
    """Validate steam/web-build and prior deliverables; return (files, entry name)."""
    web_build = STEAM / "web-build"
    if not web_build.is_dir():
        fail(f"{web_build} missing — run the expo export + inline-fonts + flatten-assets first")

    files = sorted(p for p in web_build.rglob("*") if p.is_file())
    if not files:
        fail(f"{web_build} is empty")

    entries = sorted((web_build / "_expo/static/js/web").glob("entry-*.js"))
    if len(entries) != 1:
        fail(
            f"expected exactly one entry-*.js in web-build/_expo/static/js/web, found {len(entries)} "
            "— the export is missing or was not cleaned"
        )
    entry_name = entries[0].name

    manifest = load_release_manifest(require_integrity=True)
    bundle_text = entries[0].read_text()
    missing_markers = [
        f"{name}={marker!r}"
        for name, marker in manifest["fixtureMarkers"].items()
        if marker not in bundle_text
    ]
    if missing_markers:
        fail(
            f"stale Steam web bundle: {entries[0]} is missing release fixture marker(s) "
            f"{', '.join(missing_markers)} — refresh with: pnpm run steam:refresh-web"
        )

    offenders = [p for p in files if "__node_modules" in str(p)]
    if offenders:
        fail(
            f"web-build contains {len(offenders)} __node_modules path(s) "
            f"(e.g. {offenders[0]}) — run steam/scripts/flatten-assets.mjs on it first"
        )

    longest = max(
        len("resources/app/web-build/" + p.relative_to(web_build).as_posix()) for p in files
    )
    if longest >= MAX_WINDOWS_PATH:
        fail(
            f"longest internal path would be {longest} chars (>= {MAX_WINDOWS_PATH}) inside the "
            "Windows zip — run steam/scripts/flatten-assets.mjs on web-build first"
        )

    if not WINDOWS_ZIP.exists():
        fail(f"{WINDOWS_ZIP} missing — the Electron runtime entries are carried over from it")

    if not (STEAM / "uploader").is_dir() and not UPLOADER_ZIP.exists():
        fail(
            "neither steam/uploader/ nor the existing megacity-steam-uploader.zip is available — "
            "no source for the uploader files"
        )

    for name in APP_FILES:
        if not (STEAM / name).is_file():
            fail(f"steam/{name} missing — required for resources/app/")

    check_local_requires()

    print(f"    web-build ok: {len(files)} files, entry {entry_name}, longest path {longest} chars")
    return files, entry_name


def atomic_write_zip(target: Path, build_fn) -> None:
    tmp = target.with_suffix(".tmp.zip")
    try:
        with zipfile.ZipFile(tmp, "w") as zf:
            build_fn(zf)
        os.replace(tmp, target)
    finally:
        if tmp.exists():
            tmp.unlink()


def build_windows_zip(web_files: list[Path]) -> None:
    web_build = STEAM / "web-build"

    def build(zf: zipfile.ZipFile) -> None:
        with zipfile.ZipFile(WINDOWS_ZIP) as old:
            runtime = [n for n in old.namelist() if "resources/app/" not in n]
            for name in runtime:
                zf.writestr(
                    name, old.read(name), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6
                )
        for name in APP_FILES:
            zf.write(
                STEAM / name,
                f"resources/app/{name}",
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=6,
            )
        zf.write(
            MANIFEST_PATH,
            f"resources/app/{MANIFEST_NAME}",
            compress_type=zipfile.ZIP_DEFLATED,
            compresslevel=6,
        )
        for p in web_files:
            arc = "resources/app/web-build/" + p.relative_to(web_build).as_posix()
            zf.write(p, arc, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)

    atomic_write_zip(WINDOWS_ZIP, build)


def build_kit_zip() -> None:
    def excluded(rel: Path) -> bool:
        if any(part in KIT_EXCLUDED_DIRS for part in rel.parts):
            return True
        if rel.name in KIT_EXCLUDED_FILES:
            return True
        if rel.name.endswith(".tmp.zip"):
            return True
        return False

    def build(zf: zipfile.ZipFile) -> None:
        for p in sorted(STEAM.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(STEAM)
            if excluded(rel):
                continue
            zf.write(
                p,
                "steam/" + rel.as_posix(),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=6,
            )

    atomic_write_zip(KIT_ZIP, build)


def load_uploader_scripts() -> dict[str, bytes]:
    """Uploader launcher, PowerShell script, and README from steam/uploader/."""
    src_dir = STEAM / "uploader"
    out: dict[str, bytes] = {}
    if src_dir.is_dir():
        for name in UPLOADER_FILES:
            p = src_dir / name
            if p.is_file():
                out[name] = p.read_bytes()
    missing = [n for n in UPLOADER_FILES if n not in out]
    if missing:
        if not UPLOADER_ZIP.exists():
            fail(f"missing {missing} and no existing uploader zip to carry them from")
        with zipfile.ZipFile(UPLOADER_ZIP) as old:
            for name in missing:
                candidates = [n for n in old.namelist() if n.endswith("/" + name)]
                if not candidates:
                    fail(f"{name} not found in the existing uploader zip either")
                out[name] = old.read(candidates[0])
    return out


def build_uploader_zip(scripts: dict[str, bytes], manifest_bytes: bytes) -> None:
    def build(zf: zipfile.ZipFile) -> None:
        # Nest the already-compressed Windows zip with ZIP_STORED: no
        # double compression, ~3s instead of recompressing ~170MB.
        zf.write(
            WINDOWS_ZIP,
            UPLOADER_PREFIX + WINDOWS_ZIP.name,
            compress_type=zipfile.ZIP_STORED,
        )
        for name in UPLOADER_FILES:
            zf.writestr(
                UPLOADER_PREFIX + name,
                scripts[name],
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=6,
            )
        zf.writestr(
            UPLOADER_PREFIX + MANIFEST_NAME,
            manifest_bytes,
            compress_type=zipfile.ZIP_DEFLATED,
            compresslevel=6,
        )

    atomic_write_zip(UPLOADER_ZIP, build)


def verify(app_version: str, entry_name: str, manifest: dict[str, str]) -> None:
    entry_path = STEAM / "web-build" / "_expo" / "static" / "js" / "web" / entry_name
    expected_manifest = {
        "appVersion": app_version,
        "entryBundle": entry_name,
        "bundleSha256": bundle_sha256(entry_path),
    }
    for key, expected in expected_manifest.items():
        if manifest[key] != expected:
            fail(f"release manifest {key} {manifest[key]!r} != current bundle {expected!r}")
    manifest_bytes = MANIFEST_PATH.read_bytes()

    with zipfile.ZipFile(WINDOWS_ZIP) as w:
        names = w.namelist()
        if not any(n in ("MEGACITY.exe", "game.exe") for n in names):
            fail("windows zip lost its launch executable (MEGACITY.exe/game.exe)")
        for name in APP_FILES:
            if f"resources/app/{name}" not in names:
                fail(f"windows zip missing resources/app/{name}")
        manifest_arc = f"resources/app/{MANIFEST_NAME}"
        if manifest_arc not in names:
            fail(f"windows zip missing {MANIFEST_NAME}")
        if w.read(manifest_arc) != manifest_bytes:
            fail(f"windows zip {MANIFEST_NAME} does not match steam/{MANIFEST_NAME}")
        if f"resources/app/web-build/_expo/static/js/web/{entry_name}" not in names:
            fail(f"windows zip missing the fresh bundle {entry_name}")
        packed_entry = w.read(f"resources/app/web-build/_expo/static/js/web/{entry_name}")
        if sha256(packed_entry).hexdigest() != manifest["bundleSha256"]:
            fail(f"windows zip entry {entry_name} does not match {MANIFEST_NAME}")
        stale = [
            n
            for n in names
            if n.startswith("resources/app/web-build/_expo/static/js/web/entry-")
            and not n.endswith(entry_name)
        ]
        if stale:
            fail(f"windows zip contains stale entry bundle(s): {stale}")
        if any("__node_modules" in n for n in names):
            fail("windows zip contains __node_modules paths")
        longest = max(len(n) for n in names)
        if longest >= MAX_WINDOWS_PATH:
            fail(f"windows zip longest path {longest} >= {MAX_WINDOWS_PATH}")
        zipped_version = json.loads(w.read("resources/app/package.json"))["version"]
        if zipped_version != app_version:
            fail(f"windows zip package.json version {zipped_version} != app version {app_version}")

    with zipfile.ZipFile(KIT_ZIP) as k:
        knames = k.namelist()
        if any(Path(n).name in KIT_EXCLUDED_FILES for n in knames):
            fail("build kit still contains an excluded file (MEGACITY-web-build-fixed.zip)")
        if not any(n == f"steam/web-build/_expo/static/js/web/{entry_name}" for n in knames):
            fail(f"build kit missing the fresh bundle {entry_name}")
        if "steam/" + MANIFEST_NAME not in knames:
            fail(f"build kit missing steam/{MANIFEST_NAME}")
        if k.read("steam/" + MANIFEST_NAME) != manifest_bytes:
            fail(f"build kit {MANIFEST_NAME} does not match steam/{MANIFEST_NAME}")
        kit_version = json.loads(k.read("steam/package.json"))["version"]
        if kit_version != app_version:
            fail(f"build kit package.json version {kit_version} != app version {app_version}")

    with zipfile.ZipFile(UPLOADER_ZIP) as u:
        infos = u.infolist()
        expected = {
            UPLOADER_PREFIX + WINDOWS_ZIP.name,
            UPLOADER_PREFIX + "START-UPLOAD.cmd",
            UPLOADER_PREFIX + "upload-to-steam.ps1",
            UPLOADER_PREFIX + "README.txt",
            UPLOADER_PREFIX + MANIFEST_NAME,
        }
        actual = {i.filename for i in infos}
        if actual != expected:
            fail(f"uploader zip entries wrong: {sorted(actual)}")
        nested = next(i for i in infos if i.filename.endswith(".zip"))
        if nested.compress_type != zipfile.ZIP_STORED:
            fail("nested windows zip is not ZIP_STORED (double compression)")
        if nested.file_size != WINDOWS_ZIP.stat().st_size:
            fail("nested windows zip size does not match the fresh windows zip")
        if u.read(UPLOADER_PREFIX + MANIFEST_NAME) != manifest_bytes:
            fail(f"uploader zip {MANIFEST_NAME} does not match steam/{MANIFEST_NAME}")
        # If the source-of-truth dir exists, the packed scripts must match it
        # byte for byte — otherwise a ps1 fix would silently ship stale.
        uploader_src = STEAM / "uploader"
        if uploader_src.is_dir():
            for name in ["START-UPLOAD.cmd", "upload-to-steam.ps1", "README.txt"]:
                src = uploader_src / name
                if src.is_file() and u.read(UPLOADER_PREFIX + name) != src.read_bytes():
                    fail(f"packed {name} does not match steam/uploader/{name}")

    print("    all post-build checks passed")


def main() -> None:
    total = time.monotonic()

    t = step("stamping app version into steam/package.json")
    app_version = sync_steam_package_version()
    done(t)

    t = step("preflight checks on steam/web-build and prior deliverables")
    web_files, entry_name = preflight()
    done(t)

    t = step("writing release manifest")
    write_release_manifest(app_version, entry_name)
    manifest = load_release_manifest()
    done(t)

    # Read the uploader scripts BEFORE any zip is replaced, so a carried-over
    # copy is taken from the intact previous uploader zip.
    scripts = load_uploader_scripts()

    t = step("rebuilding megacity-desktop-windows.zip (runtime carried over, app + web-build fresh)")
    build_windows_zip(web_files)
    done(t)

    t = step("rebuilding megacity-steam-build-kit.zip")
    build_kit_zip()
    done(t)

    t = step("rebuilding megacity-steam-uploader.zip (nested ZIP_STORED)")
    build_uploader_zip(scripts, MANIFEST_PATH.read_bytes())
    done(t)

    t = step("verifying all three deliverables")
    verify(app_version, entry_name, manifest)
    done(t)

    print(f"\nDeliverables for v{app_version} rebuilt in {time.monotonic() - total:.1f}s:")
    for p in [WINDOWS_ZIP, KIT_ZIP, UPLOADER_ZIP]:
        print(f"  {p.name}  {p.stat().st_size / 1_000_000:.1f} MB")


if __name__ == "__main__":
    main()
