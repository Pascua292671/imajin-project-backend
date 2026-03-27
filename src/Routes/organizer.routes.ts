import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { getMyProfile, upsertMyProfile } from "../Controller/ProfileController";

const router = Router();

router.get("/profile", requireAuth, requireRole("organizer"), getMyProfile);
router.put("/profile", requireAuth, requireRole("organizer"), upsertMyProfile);

router.post(
  "/events",
  requireAuth,
  requireRole("organizer"),
  (req, res) => {
    res.json({ message: "Organizer can create events" });
  }
);
export default router;