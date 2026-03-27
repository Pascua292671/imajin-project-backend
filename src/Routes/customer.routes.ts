import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { getMyProfile, upsertMyProfile } from "../Controller/ProfileController";

const router = Router();

router.get("/profile", requireAuth, requireRole("customer"), getMyProfile);
router.put("/profile", requireAuth, requireRole("customer"), upsertMyProfile);

export default router;