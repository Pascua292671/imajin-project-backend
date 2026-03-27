import { Request } from "express";
import { UserRole } from "../middleware/auth.middleware";

export function getAuthenticatedUser(req: Request) {
  return req.user ?? null;
}

export function getAuthenticatedRole(req: Request): UserRole | null {
  return req.user?.role ?? null;
}

export function getAuthenticatedUserId(req: Request): number | null {
  if (!req.user) return null;
  return Number(req.user.user_id);
}

export function getRoleUserId(req: Request, role: UserRole): number | null {
  if (!req.user) return null;
  if (req.user.role !== role) return null;
  return Number(req.user.user_id);
}

export function getCustomerId(req: Request): number | null {
  return getRoleUserId(req, "customer");
}

export function getArtistId(req: Request): number | null {
  return getRoleUserId(req, "artist");
}

export function getSessionistId(req: Request): number | null {
  return getRoleUserId(req, "sessionist");
}

export function getOrganizerId(req: Request): number | null {
  return getRoleUserId(req, "organizer");
}