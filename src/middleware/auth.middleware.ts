import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type UserRole =
  | "customer"
  | "artist"
  | "sessionist"
  | "organizer";

export type UserPayload = {
  id: number;
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

const ACCESS_COOKIE_NAME = "accessToken";

function isValidRole(role: unknown): role is UserRole {
  return (
    role === "customer" ||
    role === "artist" ||
    role === "sessionist" ||
    role === "organizer"
  );
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  return null;
}

function decodeUserFromRequest(req: Request): AuthenticatedRequestUser | null {
  const token = extractToken(req);
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  const decoded = jwt.verify(token, secret) as UserPayload;

  if (
    !decoded ||
    typeof decoded.id !== "number" ||
    typeof decoded.user_id !== "number" ||
    !isValidRole(decoded.role)
  ) {
    return null;
  }

  return {
    id: decoded.id,
    user_id: decoded.user_id,
    role: decoded.role,
    email: decoded.email ?? null,
    username: decoded.username ?? null,
  };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const user = decodeUserFromRequest(req);

    if (!user) {
      res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      clearAuthCookie(res);

      res.status(401).json({
        ok: false,
        code: "TOKEN_EXPIRED",
        message: "Session expired. Please log in again.",
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      clearAuthCookie(res);

      res.status(401).json({
        ok: false,
        code: "INVALID_TOKEN",
        message: "Invalid token. Please log in again.",
      });
      return;
    }

    console.error("[requireAuth] auth error:", error);
    res.status(500).json({
      ok: false,
      message: "Authentication error",
    });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      if (!req.user) {
        res.status(401).json({
          ok: false,
          message: "Unauthorized",
        });
        return;
      }

      if (!allowedRoles.includes(req.user.role)) {
        res.status(403).json({
          ok: false,
          message: "Forbidden",
        });
        return;
      }

      next();
    });
  };
}