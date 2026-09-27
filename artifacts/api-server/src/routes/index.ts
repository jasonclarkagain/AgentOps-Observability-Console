import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentopsRouter from "./agentops";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentopsRouter);

export default router;
