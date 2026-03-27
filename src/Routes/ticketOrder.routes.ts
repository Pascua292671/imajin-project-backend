import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  createTicketOrder,
  getMyTicketOrders,
  getTicketOrderById,
} from "../Controller/TicketOrderController";

const router = Router();

router.post("/", requireAuth, createTicketOrder);
router.get("/my", requireAuth, getMyTicketOrders);
router.get("/:orderId", requireAuth, getTicketOrderById);

export default router;