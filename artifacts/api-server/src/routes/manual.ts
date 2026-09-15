import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = Router();

const here = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH = path.resolve(
  here,
  "../../../megacity/dist-download/MEGACITY_MANUAL.pdf",
);

router.get("/manual", (_req, res) => {
  if (!fs.existsSync(PDF_PATH)) {
    res.status(404).send("Manual not found.");
    return;
  }
  res.download(PDF_PATH, "MEGACITY-Game-Manual.pdf");
});

export default router;
