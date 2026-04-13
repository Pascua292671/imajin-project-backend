import { Router } from "express";
import { paymongoWebhook } from "../Controller/TicketOrderController";

const router = Router();

router.post("/paymongo/webhook", paymongoWebhook);

export default router;