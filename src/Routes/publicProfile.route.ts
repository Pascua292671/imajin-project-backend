import { Router } from "express";
import {
  getPublicArtistProfile,
  getPublicSessionistProfile,
  getPublicOrganizerProfile,
  getPublicCustomerProfile,
} from "../Controller/PublicProfileController";
import { optionalAuth } from "../middleware/auth.middleware";
const router = Router();

router.get("/artist/:username", getPublicArtistProfile);
router.get("/sessionist/:username", getPublicSessionistProfile);
router.get("/organizer/:username", getPublicOrganizerProfile);
router.get("/customer/:username", getPublicCustomerProfile);
router.get("/events", optionalAuth, (req, res) => {
  if (req.user) {
    console.log("Logged in user:", req.user);
  }
  res.json({ message: "Public events" });
});
export default router;