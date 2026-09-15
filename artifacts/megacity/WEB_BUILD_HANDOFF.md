# MEGACITY Web Build Handoff

How the game's web build is handed to the **separate Steam/desktop packaging
project**. This is a **manual handoff**: a single file is built here, downloaded,
and dropped into the packaging project by hand. (Automatic syncing between the two
projects is a possible later upgrade and is intentionally not done here.)

## Produce the file (in this project)

```
pnpm --filter @workspace/megacity run handoff
```

This exports the game's web build and bundles it, with self-describing marker
files, into a single zip:

```
artifacts/megacity/dist-download/web-build.zip
```

Download that file from the project's file pane and move it to the packaging
project.

> The export takes a few minutes and clashes with the running `megacity: expo`
> dev server — stop that dev workflow before running a fresh export. To repackage
> an already-exported build without re-exporting:
> `pnpm --filter @workspace/megacity run handoff -- --skip-build --from <build-dir>`

## Handoff contract (copy this into the packaging project)

- The packaging project receives a single file: **`web-build.zip`**.
- Unzipping it yields, **at the top level**:
  - The game's static web build — `index.html` plus `assets/`, `_expo/`, and the
    other build files (icons, `manifest.json`, `sw.js`, etc.). These are the
    `web-build/` contents.
  - **`READ_ME_FIRST.txt`** — a plain-language note.
  - **`BUILD_INFO.json`** — machine-readable provenance:
    `game`, `package`, `version`, `buildDate`, `sourceCommit`, `sourceProject`,
    and the flags `purpose: "packaging-input"` and `editable: false`.
- On receipt, the packaging project should:
  1. Replace its existing `web-build/` contents **wholesale** with everything in
     the bundle **except** `READ_ME_FIRST.txt` and `BUILD_INFO.json` (it may keep
     those alongside or discard them — they are markers, not game files).
  2. Optionally read `BUILD_INFO.json` to log which version it is packaging.
  3. Run its existing desktop/Steam packaging (Electron or Tauri) as it does today.
- Nothing in the bundle is source to modify — it is generated input only. To update
  to a newer game version, replace the whole bundle again.

## Windows long-path caveat (for whoever builds a Windows binary)

The build contains a few deeply nested icon-font / image asset paths under
`assets/__node_modules/.pnpm/...` — some over 300 characters. Linux and macOS
unzip these fine, but **Windows refuses paths ≥ 260 characters**, so extracting
on Windows (or copying these paths while building a Windows desktop binary) can
fail with "path too long".

The packaging project should shorten these before producing a Windows build —
e.g. relocate the deep `assets/__node_modules/...` files into a short folder and
update their references in `_expo/static/js/web/entry-*.js`, where they appear as
literal URL strings (there is no SRI/hash check on them in `index.html`).
