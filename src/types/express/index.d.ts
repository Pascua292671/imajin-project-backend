import "express";
import type { Multer } from "multer";

export type UserRole = "customer" | "artist" | "sessionist" | "organizer";

declare global {
  namespace Express {
    interface User {
      id: number;
      user_id: number;
      role: UserRole;
      email?: string | null;
      username?: string | null;
    }

    interface Request {
      user?: User;
      file?: Multer.File;
      files?:
        | Multer.File[]
        | { [fieldname: string]: Multer.File[] };
    }
  }
}

export {};