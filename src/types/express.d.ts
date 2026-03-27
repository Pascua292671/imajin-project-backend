// src/types/express.d.ts
import type { UserPayload } from "../middleware/auth.middleware";

declare global {
  namespace Express {
    interface User extends UserPayload {}
  }
}

export {};