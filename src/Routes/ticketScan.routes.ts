import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  scanTicketQr,
  confirmCashTicketPaymentAndEntry,
} from "../Controller/TicketScanController";

const router = Router();

router.post("/scan", requireAuth, requireRole("organizer"), scanTicketQr);
router.post(
  "/scan/confirm-cash",
  requireAuth,
  requireRole("organizer"),
  confirmCashTicketPaymentAndEntry
);

export default router;
