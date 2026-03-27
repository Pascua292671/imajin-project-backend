import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { getMyProfile, upsertMyProfile } from "../Controller/ProfileController";

const router = Router();

router.get("/profile", requireAuth, requireRole("artist"), getMyProfile);
router.put("/profile", requireAuth, requireRole("artist"), upsertMyProfile);

router.get(
  "/artist/profile",
  requireAuth,
  requireRole("artist","sessionist"),
  getMyProfile
);

export default router;

