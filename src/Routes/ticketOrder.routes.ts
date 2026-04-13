import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  createTicketOrder,
  getMyTicketOrders,
  getTicketOrderById,
  continueTicketOrderPayment,
  reserveTicketOrder,
  payReservationBalance,
  expireReservationOrders,
} from "../Controller/TicketOrderController";

const router = Router();

router.post("/", requireAuth, createTicketOrder);
router.post("/reserve", requireAuth, reserveTicketOrder);
router.post("/:orderId/pay-balance", requireAuth, payReservationBalance);

router.get("/my", requireAuth, getMyTicketOrders);
router.get("/:orderId", requireAuth, getTicketOrderById);
router.post("/:orderId/continue-payment", requireAuth, continueTicketOrderPayment);
router.post("/expire-reservations", expireReservationOrders);
export default router;