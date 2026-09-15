import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = Router();

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(here, "../../../megacity/dist-download");
const ARTICLE_PATH = path.join(DIST_DIR, "MEGACITY_IndieDB_Article.md");

router.get("/indiedb-article", (_req, res) => {
  if (!fs.existsSync(ARTICLE_PATH)) {
    res.status(404).send("Article not found.");
    return;
  }
  res.download(ARTICLE_PATH, "MEGACITY_IndieDB_Article.md");
});

export default router;
