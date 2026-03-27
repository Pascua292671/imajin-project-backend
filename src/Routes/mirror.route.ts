import { Router } from "express";
import { mirrorTest } from "../Controller/mirrorTest.controller";

const router = Router();

// GET /api/mirror/test
router.get("/test", mirrorTest);

export default router;