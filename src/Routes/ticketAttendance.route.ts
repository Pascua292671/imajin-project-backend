import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { scanTicketQr } from "../Controller/TicketScanController";
import { getAttendanceDashboard } from "../Controller/TicketAttendanceController";

const router = Router();

router.post("/scan", requireAuth, scanTicketQr);
router.get("/attendance/:eventId", requireAuth, getAttendanceDashboard);

export default router;