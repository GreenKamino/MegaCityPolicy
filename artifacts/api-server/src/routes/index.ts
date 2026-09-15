import { Router, type IRouter } from "express";
import healthRouter from "./health";
import privacyRouter from "./privacy";
import manualRouter from "./manual";
import dialogueKitRouter from "./dialogueKit";
import articlesRouter from "./articles";
import steamBuildRouter from "./steamBuild";

const router: IRouter = Router();

router.use(healthRouter);
router.use(privacyRouter);
router.use(manualRouter);
router.use(dialogueKitRouter);
router.use(articlesRouter);
router.use(steamBuildRouter);

export default router;
