import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = Router();

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(here, "../../../megacity/dist-download");
const PDF_PATH = path.join(DIST_DIR, "MEGACITY-Dialogue-Kit.pdf");
const MD_PATH = path.join(DIST_DIR, "megacity-dialogue-kit.md");

router.get("/dialogue-kit", (_req, res) => {
  if (!fs.existsSync(PDF_PATH)) {
    res.status(404).send("Dialogue kit not found.");
    return;
  }
  res.download(PDF_PATH, "MEGACITY-Dialogue-Kit.pdf");
});

router.get("/dialogue-kit-md", (_req, res) => {
  if (!fs.existsSync(MD_PATH)) {
    res.status(404).send("Dialogue kit not found.");
    return;
  }
  res.download(MD_PATH, "MEGACITY-Dialogue-Kit.md");
});

export default router;
