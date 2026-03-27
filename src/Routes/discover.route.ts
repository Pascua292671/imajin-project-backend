import { Router } from "express";
import { listArtists, listSessionists } from "../Controller/DiscoverController";

const router = Router();

router.get("/artists", listArtists);
router.get("/sessionists", listSessionists);

export default router;