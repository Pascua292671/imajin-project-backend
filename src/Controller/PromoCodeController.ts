import { Request, Response } from "express";
import { z } from "zod";
import { mysqlQuery } from "../utils/mysqlQuery";
import {
  createPromoCode,
  getPromoCodesByEvent,
  getPromoCodeById,
  setPromoCodeActiveState,
} from "../services/promo.code";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

type AuthenticatedUser = {
  id?: number | string;
  user_id?: number | string;
  role?: UserRole;
  email?: string | null;
  username?: string | null;
};

const CreatePromoCodeSchema = z.object({
  eventId: z.string().trim().min(1, "Event ID is required"),
  code: z.string().trim().min(3).max(50),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

const TogglePromoSchema = z.object({
  isActive: z.boolean(),
});

function getAuthUser(req: Request): AuthenticatedUser | null {
  const user = req.user as AuthenticatedUser | undefined;

  if (!user) return null;
  if (!user.role) return null;

  return user;
}

function getOrganizerAuthId(user: AuthenticatedUser): string | null {
  if (user.id !== undefined && user.id !== null) {
    return String(user.id);
  }

  if (user.user_id !== undefined && user.user_id !== null) {
    return String(user.user_id);
  }

  return null;
}

export async function createEventPromoCode(req: Request, res: Response) {
  try {
    const parsed = CreatePromoCodeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid request body.",
        errors: parsed.error.flatten(),
      });
    }

    const user = getAuthUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (user.role !== "organizer") {
      return res.status(403).json({
        message: "Only organizers can create promo codes.",
      });
    }

    const organizerAuthId = getOrganizerAuthId(user);

    if (!organizerAuthId) {
      return res.status(401).json({
        message: "Invalid authenticated user.",
      });
    }

    const {
      eventId,
      code,
      discountType,
      discountValue,
      maxUses,
      startsAt,
      endsAt,
    } = parsed.data;

    if (discountType === "percent" && discountValue > 100) {
      return res.status(400).json({
        message: "Percent promo cannot exceed 100.",
      });
    }

    const eventRows = await mysqlQuery<any[]>(
      `
      SELECT id, organizer_id
      FROM events
      WHERE id = ?
      LIMIT 1
      `,
      [eventId],
    );

    const event = eventRows[0];

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (String(event.organizer_id) !== organizerAuthId) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const promo = await createPromoCode({
      eventId,
      code,
      discountType,
      discountValue,
      maxUses: maxUses ?? null,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      createdBy: Number(organizerAuthId),
    });

    return res.status(201).json({
      message: "Promo code created successfully.",
      promo,
    });
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Promo code already exists for this event.",
      });
    }

    console.error("createEventPromoCode error:", error);
    return res.status(500).json({ message: "Failed to create promo code." });
  }
}

export async function listEventPromoCodes(req: Request, res: Response) {
  try {
    const user = getAuthUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (user.role !== "organizer") {
      return res.status(403).json({
        message: "Only organizers can view event promo codes.",
      });
    }

    const organizerAuthId = getOrganizerAuthId(user);

    if (!organizerAuthId) {
      return res.status(401).json({
        message: "Invalid authenticated user.",
      });
    }

    const eventId = String(req.params.eventId || "").trim();

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required." });
    }

    const eventRows = await mysqlQuery<any[]>(
      `
      SELECT id, organizer_id
      FROM events
      WHERE id = ?
      LIMIT 1
      `,
      [eventId],
    );

    const event = eventRows[0];

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (String(event.organizer_id) !== organizerAuthId) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const promos = await getPromoCodesByEvent(eventId);

    return res.status(200).json({
      items: promos,
    });
  } catch (error) {
    console.error("listEventPromoCodes error:", error);
    return res.status(500).json({ message: "Failed to fetch promo codes." });
  }
}

export async function toggleEventPromoCode(req: Request, res: Response) {
  try {
    const parsed = TogglePromoSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid request body.",
        errors: parsed.error.flatten(),
      });
    }

    const user = getAuthUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (user.role !== "organizer") {
      return res.status(403).json({
        message: "Only organizers can update promo codes.",
      });
    }

    const organizerAuthId = getOrganizerAuthId(user);

    if (!organizerAuthId) {
      return res.status(401).json({
        message: "Invalid authenticated user.",
      });
    }

    const promoId = String(req.params.promoId || "").trim();

    if (!promoId) {
      return res.status(400).json({ message: "Promo ID is required." });
    }

    const promo = await getPromoCodeById(promoId);

    if (!promo) {
      return res.status(404).json({ message: "Promo code not found." });
    }

    const eventRows = await mysqlQuery<any[]>(
      `
      SELECT id, organizer_id
      FROM events
      WHERE id = ?
      LIMIT 1
      `,
      [promo.event_id],
    );

    const event = eventRows[0];

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (String(event.organizer_id) !== organizerAuthId) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const updatedPromo = await setPromoCodeActiveState({
      promoId,
      isActive: parsed.data.isActive,
    });

    return res.status(200).json({
      message: "Promo code updated successfully.",
      promo: updatedPromo,
    });
  } catch (error) {
    console.error("toggleEventPromoCode error:", error);
    return res.status(500).json({ message: "Failed to update promo code." });
  }
}