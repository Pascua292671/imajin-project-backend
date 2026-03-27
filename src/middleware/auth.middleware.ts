import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type UserRole =
  | "customer"
  | "artist"
  | "sessionist"
  | "organizer";

export type UserPayload = {
  id?: number;
  user_id: number;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

type AuthenticatedRequestUser = {
  id: number;
  user_id: number;
  role: UserRole;
  email: string | null;
  username: string | null;
};

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieToken = req.cookies?.accessToken;
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return null;
}

function decodeUserFromRequest(req: Request): AuthenticatedRequestUser | null {
  const token = extractToken(req);

  if (!token) return null;
  if (!process.env.JWT_SECRET) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET) as UserPayload;

  const resolvedId = Number(decoded.id ?? decoded.user_id);
  const resolvedUserId = Number(decoded.user_id);

  if (!Number.isFinite(resolvedId) || !Number.isFinite(resolvedUserId)) {
    return null;
  }

  return {
    id: resolvedId,
    user_id: resolvedUserId,
    role: decoded.role,
    email: decoded.email ?? null,
    username: decoded.username ?? null,
  };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = decodeUserFromRequest(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const user = decodeUserFromRequest(req);

    if (user) {
      req.user = user;
    }

    next();
  } catch {
    next();
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return res.status(403).json({
        message: "Forbidden: insufficient permissions",
      });
    }

    next();
  };
}