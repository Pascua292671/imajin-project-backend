import { Request, Response } from "express";
import cloudinary from "../databes/config/cloudinary";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

type AuthenticatedUser = {
  id: number | string;
  user_id: number | string;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

function getAuthUser(req: Request): AuthenticatedUser | null {
  const user = req.user as AuthenticatedUser | undefined;
  if (!user) return null;
  if (!user.role) return null;
  if (user.user_id === undefined || user.user_id === null) return null;
  return user;
}

async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          resource_type: "image",
        },
        (error, result) => {
          if (error || !result) {
            return reject(error || new Error("Cloudinary upload failed"));
          }
          resolve(result.secure_url);
        }
      )
      .end(buffer);
  });
}

export async function uploadProfileMedia(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const kind = String(req.body.kind || "").trim();
    const file = req.file;

    if (!file?.buffer) {
      return res.status(400).json({ message: "Image file is required" });
    }

    if (kind !== "profile" && kind !== "cover") {
      return res.status(400).json({
        message: "Invalid upload kind. Use 'profile' or 'cover'",
      });
    }

    const folder = `imajin/${authUser.role}/${kind}`;
    const imageUrl = await uploadBufferToCloudinary(file.buffer, folder);

    return res.status(200).json({
      message: `${kind} image uploaded successfully`,
      kind,
      imageUrl,
    });
  } catch (error: any) {
    console.error("uploadProfileMedia error:", error);
    return res.status(500).json({
      message: "Failed to upload image",
      error: error?.message ?? "Unknown error",
    });
  }
}