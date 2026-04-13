import { Router } from "express";
import {
  listArtists,
  listSessionists,
  getArtistById,
  getSessionistById,
} from "../Controller/DiscoverController";

const router = Router();

router.get("/artists", listArtists);
router.get("/artists/:id", getArtistById);

router.get("/sessionists", listSessionists);
router.get("/sessionists/:id", getSessionistById);

export default router;