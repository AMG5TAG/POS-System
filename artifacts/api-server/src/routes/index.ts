import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import merchantsRouter from "./merchants";
import plansRouter from "./plans";
import productsRouter from "./products";
import customersRouter from "./customers";
import transactionsRouter from "./transactions";
import staffRouter from "./staff";
import inventoryRouter from "./inventory";
import dashboardRouter from "./dashboard";
import appointmentsRouter from "./appointments";
import serviceJobsRouter from "./service-jobs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(merchantsRouter);
router.use(plansRouter);
router.use(productsRouter);
router.use(customersRouter);
router.use(transactionsRouter);
router.use(staffRouter);
router.use(inventoryRouter);
router.use(dashboardRouter);
router.use(appointmentsRouter);
router.use(serviceJobsRouter);

export default router;
