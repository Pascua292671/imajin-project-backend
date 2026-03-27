import { Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { mysqlQuery } from "../utils/mysqlQuery";
import { queryWithMirror } from "../databes/config/SupabaseDb";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

const ENABLE_MIRROR = false;

type AuthenticatedUser = {
  id: number | string;
  user_id: number | string;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

function getAuthOrganizerId(req: Request): number | null {
  const user = req.user as AuthenticatedUser | undefined;

  if (!user) return null;
  if (user.role !== "organizer") return null;

  const rawId = user.user_id;
  if (rawId === undefined || rawId === null) return null;

  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const TierSchema = z.object({
  name: z.string().trim().min(2, "Tier name must be at least 2 characters"),
  price_php: z.number().int().min(0, "Price must be 0 or higher"),
  capacity: z.number().int().min(1, "Capacity must be at least 1"),
});

export async function addTier(req: Request, res: Response) {
  try {
    const authOrganizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res.status(403).json({ message: "Only organizers can add tiers" });
    }

    const eventId = String(req.params.eventId || "").trim();

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const ownedEvent = await mysqlQuery<any[]>(
      `SELECT id FROM events WHERE id = ? AND organizer_id = ? LIMIT 1`,
      [eventId, authOrganizerId]
    );

    if (!ownedEvent.length) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    const parsed = TierSchema.parse({
      name: req.body.name,
      price_php: Number(req.body.price_php),
      capacity: Number(req.body.capacity),
    });

    const id = uuidv4();

    await mysqlQuery(
      `INSERT INTO event_ticket_tiers (id, event_id, name, price_php, capacity, sold)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [id, eventId, parsed.name, parsed.price_php, parsed.capacity]
    );

    if (ENABLE_MIRROR) {
      queryWithMirror("event_ticket_tiers", {
        id,
        event_id: eventId,
        name: parsed.name,
        price_php: parsed.price_php,
        capacity: parsed.capacity,
        sold: 0,
      }).catch((e) => console.warn("mirror tier failed:", e));
    }

    return res.status(201).json({
      message: "Tier added",
      tier: {
        id,
        event_id: eventId,
        name: parsed.name,
        price_php: parsed.price_php,
        capacity: parsed.capacity,
        sold: 0,
      },
    });
  } catch (e: any) {
    console.error("addTier error:", e);
    return res.status(400).json({
      message: e?.message || "Add tier failed",
    });
  }
}

export async function listTiers(req: Request, res: Response) {
  try {
    const authOrganizerId = getAuthOrganizerId(req);
    const eventId = String(req.params.eventId || "").trim();

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res.status(403).json({ message: "Only organizers can view tiers" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const eventRows = await mysqlQuery<any[]>(
      `
      SELECT id, organizer_id
      FROM events
      WHERE id = ? AND organizer_id = ?
      LIMIT 1
      `,
      [eventId, authOrganizerId]
    );

    if (!eventRows.length) {
      return res.status(404).json({
        message: "Event not found or access denied",
      });
    }

    const tierRows = await mysqlQuery<any[]>(
      `
      SELECT 
        id,
        event_id,
        name,
        price_php,
        capacity,
        sold,
        created_at
      FROM event_ticket_tiers
      WHERE event_id = ?
      ORDER BY created_at DESC
      `,
      [eventId]
    );

    return res.status(200).json({
      message: "Tiers fetched successfully",
      tiers: tierRows,
    });
  } catch (error) {
    console.error("listTiers error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteTier(req: Request, res: Response) {
  try {
    const authOrganizerId = getAuthOrganizerId(req);
    const tierId = String(req.params.tierId || "").trim();

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res.status(403).json({ message: "Only organizers can delete tiers" });
    }

    if (!tierId) {
      return res.status(400).json({ message: "Tier ID is required" });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT t.id, t.event_id, e.organizer_id
      FROM event_ticket_tiers t
      INNER JOIN events e ON e.id = t.event_id
      WHERE t.id = ? AND e.organizer_id = ?
      LIMIT 1
      `,
      [tierId, authOrganizerId]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Tier not found or access denied",
      });
    }

    await mysqlQuery(`DELETE FROM event_ticket_tiers WHERE id = ?`, [tierId]);

    return res.status(200).json({
      message: "Tier deleted successfully",
      tierId,
    });
  } catch (error) {
    console.error("deleteTier error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}