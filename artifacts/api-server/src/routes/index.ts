import { Router, type IRouter } from "express";
import healthRouter from "./health";
import locationRouter from "./location";

const router: IRouter = Router();

router.use(healthRouter);
router.use(locationRouter);

export default router;
