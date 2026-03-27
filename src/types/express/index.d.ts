import "express";

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
      file?: Express.Multer.File;
      files?:
        | Express.Multer.File[]
        | { [fieldname: string]: Express.Multer.File[] };
    }
  }
}

export {};