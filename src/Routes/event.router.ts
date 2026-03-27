import { Router } from "express";
import multer from "multer";

import {
  createEvent,
  updateEvent,
  publishEvent,
  unpublishEvent,
  listEvents,
  listPublishedEvents,
  getEventById,
  deleteEvent,
} from "../Controller/EventController";

import { requireAuth, requireRole } from "../middleware/auth.middleware";

import { addTier, listTiers, deleteTier } from "../Controller/Tiercontroller";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// EVENTS
router.post(
  "/events",
  requireAuth,
  requireRole("organizer"),
  upload.single("poster"),
  createEvent,
);

router.put(
  "/events/:id",
  requireAuth,
  requireRole("organizer"),
  upload.single("poster"),
  updateEvent,
);

router.patch(
  "/events/:id",
  requireAuth,
  requireRole("organizer"),
  upload.single("poster"),
  updateEvent,
);

router.patch(
  "/events/:id/publish",
  requireAuth,
  requireRole("organizer"),
  publishEvent,
);

router.patch(
  "/events/:id/unpublish",
  requireAuth,
  requireRole("organizer"),
  unpublishEvent,
);

router.delete(
  "/events/:id",
  requireAuth,
  requireRole("organizer"),
  deleteEvent,
);

router.get("/events", requireAuth, requireRole("organizer"), listEvents);

// PUBLIC
router.get("/events/published", listPublishedEvents);

// ORGANIZER SINGLE EVENT
router.get("/events/:id", requireAuth, requireRole("organizer"), getEventById);

// TIERS
router.get(
  "/events/:eventId/tiers",
  requireAuth,
  requireRole("organizer"),
  listTiers,
);

router.post(
  "/events/:eventId/tiers",
  requireAuth,
  requireRole("organizer"),
  addTier,
);

router.delete(
  "/tiers/:tierId",
  requireAuth,
  requireRole("organizer"),
  deleteTier,
);

export default router;
