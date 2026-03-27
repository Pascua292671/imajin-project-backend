import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  createInvitation,
  getSentInvitations,
  getReceivedInvitations,
  updateInvitationStatus,
} from "../Controller/InvitationController";

const router = Router();

router.post("/", requireAuth, createInvitation);
router.get("/sent", requireAuth, getSentInvitations);
router.get("/received", requireAuth, getReceivedInvitations);
router.patch("/:id/status", requireAuth, updateInvitationStatus);

export default router;