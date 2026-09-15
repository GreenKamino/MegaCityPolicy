#!/usr/bin/env python3
"""Verify the refreshed Steam web bundle and all downloadable deliverables."""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"health check failed: {message}")


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    steam = root / "steam"
    dist = root / "dist-download"

    web = steam / "web-build"
    entry_files = list((web / "_expo/static/js/web").glob("entry-*.js"))
    if len(entry_files) != 1:
        fail(f"expected one web entry, found {len(entry_files)}")
    if any("__node_modules" in p.as_posix() for p in web.rglob("*")):
        fail("web-build still contains __node_modules paths")
    if not (web / "index.html").is_file():
        fail("web-build/index.html is missing")

    required = {
        "megacity-desktop-windows.zip": [
            "resources/app/main.js",
            "resources/app/preload.js",
            "resources/app/steam_appid.txt",
        ],
        "megacity-steam-build-kit.zip": [
            "steam/web-build/index.html",
            f"steam/web-build/_expo/static/js/web/{entry_files[0].name}",
        ],
        "megacity-steam-uploader.zip": [
            "megacity-steam-uploader/megacity-desktop-windows.zip",
            "megacity-steam-uploader/upload-to-steam.ps1",
            "megacity-steam-uploader/README.txt",
        ],
    }

    for filename, expected in required.items():
        archive = dist / filename
        if not archive.is_file():
            fail(f"missing {archive}")
        with zipfile.ZipFile(archive) as zf:
            bad = zf.testzip()
            if bad:
                fail(f"corrupt entry {bad} in {filename}")
            names = set(zf.namelist())
            missing = [name for name in expected if name not in names]
            if missing:
                fail(f"{filename} missing {missing}")

    print(
        "health check passed: "
        f"{entry_files[0].name}; all three deliverables are readable"
    )


if __name__ == "__main__":
    main()