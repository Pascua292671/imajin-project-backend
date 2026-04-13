import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  createMyAvailability,
  deleteMyAvailability,
  getMyAvailability,
  updateMyAvailability,
} from "../Controller/AvailabilityController";

const router = Router();

router.get("/me", requireAuth, getMyAvailability);
router.post("/me", requireAuth, createMyAvailability);
router.put("/me/:id", requireAuth, updateMyAvailability);
router.delete("/me/:id", requireAuth, deleteMyAvailability);

export default router;