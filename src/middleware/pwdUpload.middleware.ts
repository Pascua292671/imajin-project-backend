import multer from "multer";
import path from "path";
import { Request } from "express";

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error("Only JPG, JPEG, PNG, and WEBP files are allowed."));
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowedExt = new Set([".jpg", ".jpeg", ".png", ".webp"]);

  if (!allowedExt.has(ext)) {
    return cb(new Error("Invalid file extension."));
  }

  cb(null, true);
}

export const pwdUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 3,
  },
}).fields([
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
  { name: "selfieWithId", maxCount: 1 },
]);