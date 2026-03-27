import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.middleware";
import { getMyProfile, upsertMyProfile } from "../Controller/ProfileController";
import { uploadProfileMedia } from "../Controller/ProfileUploadController";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.get("/me", requireAuth, getMyProfile);
router.put("/me", requireAuth, upsertMyProfile);
router.post("/upload", requireAuth, upload.single("image"), uploadProfileMedia);

export default router;