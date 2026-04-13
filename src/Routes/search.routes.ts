import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { searchUsers } from "../Controller/SearchController";

const router = Router();

router.get(
  "/users",
  requireAuth,
  requireRole("organizer"),
  searchUsers
);

export default router;