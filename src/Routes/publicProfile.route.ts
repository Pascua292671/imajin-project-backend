import { Router } from "express";
import {
  getPublicArtistProfile,
  getPublicSessionistProfile,
  getPublicOrganizerProfile,
  getPublicCustomerProfile,
} from "../Controller/PublicProfileController";

const router = Router();

router.get("/artist/:username", getPublicArtistProfile);
router.get("/sessionist/:username", getPublicSessionistProfile);
router.get("/organizer/:username", getPublicOrganizerProfile);
router.get("/customer/:username", getPublicCustomerProfile);

export default router;