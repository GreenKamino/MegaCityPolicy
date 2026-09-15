import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = Router();

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(here, "../../../megacity/dist-download");
const UPLOADER_PATH = path.join(DIST_DIR, "megacity-steam-uploader.zip");
const WINDOWS_PATH = path.join(DIST_DIR, "megacity-desktop-windows.zip");

router.get("/steam-build", (_req, res) => {
  if (!fs.existsSync(UPLOADER_PATH)) {
    res.status(404).send("Steam build not found.");
    return;
  }
  res.download(UPLOADER_PATH, "megacity-steam-uploader.zip");
});

router.get("/windows-build", (_req, res) => {
  if (!fs.existsSync(WINDOWS_PATH)) {
    res.status(404).send("Windows build not found.");
    return;
  }
  res.download(WINDOWS_PATH, "megacity-desktop-windows.zip");
});

export default router;
