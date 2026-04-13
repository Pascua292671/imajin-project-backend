import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  createEventPromoCode,
  listEventPromoCodes,
  toggleEventPromoCode,
} from "../Controller/PromoCodeController";

const router = Router();

router.post("/", requireAuth, createEventPromoCode);
router.get("/event/:eventId", requireAuth, listEventPromoCodes);
router.patch("/:promoId/active", requireAuth, toggleEventPromoCode);

export default router;