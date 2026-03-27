import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  createBooking,
  getMyBookings,
  confirmBooking,
} from "../Controller/BookingController";

const router = Router();

router.post("/", requireAuth, createBooking);
router.get("/my", requireAuth, getMyBookings);
router.patch("/:id/confirm", requireAuth, confirmBooking);

export default router;