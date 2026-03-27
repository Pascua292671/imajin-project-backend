import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { getMyProfile, upsertMyProfile } from "../Controller/ProfileController";

const router = Router();

router.get("/profile", requireAuth, requireRole("sessionist"), getMyProfile);
router.put("/profile", requireAuth, requireRole("sessionist"), upsertMyProfile);

export default router;