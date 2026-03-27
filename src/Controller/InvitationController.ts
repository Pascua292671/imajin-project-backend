import { Request, Response } from "express";
import { z } from "zod";
import { mysqlQuery } from "../utils/mysqlQuery";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

const createInvitationSchema = z.object({
  event_id: z.string().min(1),
  recipient_role: z.enum(["artist", "sessionist"]),
  recipient_user_id: z.number().int().positive(),
  message: z.string().optional().nullable(),
});

const updateInvitationStatusSchema = z.object({
  status: z.enum(["accepted", "rejected", "cancelled"]),
});

async function ensureOrganizerOwnsEvent(eventId: string, organizerId: string) {
  const rows = await mysqlQuery<any[]>(
    `
    SELECT id, organizer_id, title
    FROM events
    WHERE id = ?
    LIMIT 1
    `,
    [eventId]
  );

  if (!rows.length) return null;

  const event = rows[0];

  if (String(event.organizer_id) !== String(organizerId)) {
    return null;
  }

  return event;
}

async function recipientExists(role: "artist" | "sessionist", userId: number) {
  const table = role === "artist" ? "artist" : "sessionist";

  const rows = await mysqlQuery<any[]>(
    `SELECT id FROM ${table} WHERE id = ? LIMIT 1`,
    [userId]
  );

  return rows.length > 0;
}

export async function createInvitation(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const authRole = req.user.role as UserRole;
    const authOrganizerId = String(req.user.user_id);

    if (authRole !== "organizer") {
      return res.status(403).json({ message: "Only organizers can send invitations" });
    }

    const parsed = createInvitationSchema.parse({
      ...req.body,
      recipient_user_id: Number(req.body?.recipient_user_id),
    });

    const ownedEvent = await ensureOrganizerOwnsEvent(parsed.event_id, authOrganizerId);

    if (!ownedEvent) {
      return res.status(403).json({
        message: "You can only send invitations for your own events",
      });
    }

    const exists = await recipientExists(parsed.recipient_role, parsed.recipient_user_id);

    if (!exists) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    const duplicate = await mysqlQuery<any[]>(
      `
      SELECT id
      FROM event_invitations
      WHERE event_id = ?
        AND recipient_role = ?
        AND recipient_user_id = ?
        AND status IN ('pending', 'accepted')
      LIMIT 1
      `,
      [parsed.event_id, parsed.recipient_role, parsed.recipient_user_id]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({
        message: "An active invitation already exists for this recipient and event",
      });
    }

    const result = await mysqlQuery<any>(
      `
      INSERT INTO event_invitations
      (event_id, organizer_id, recipient_role, recipient_user_id, message, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
      `,
      [
        parsed.event_id,
        authOrganizerId,
        parsed.recipient_role,
        parsed.recipient_user_id,
        parsed.message ?? null,
      ]
    );

    return res.status(201).json({
      message: "Invitation sent successfully",
      invitation_id: result.insertId,
    });
  } catch (error: any) {
    console.error("createInvitation error:", error);

    if (error?.name === "ZodError") {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
      });
    }

    return res.status(500).json({
      message: "Failed to send invitation",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function getSentInvitations(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const authRole = req.user.role as UserRole;
    const authOrganizerId = String(req.user.user_id);

    if (authRole !== "organizer") {
      return res.status(403).json({ message: "Only organizers can view sent invitations" });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        ei.id,
        ei.event_id,
        ei.organizer_id,
        ei.recipient_role,
        ei.recipient_user_id,
        ei.message,
        ei.status,
        ei.created_at,
        e.title AS event_title,
        CASE
          WHEN ei.recipient_role = 'artist' THEN a.Stage_name
          WHEN ei.recipient_role = 'sessionist' THEN s.Stage_Name
          ELSE NULL
        END AS recipient_display_name,
        CASE
          WHEN ei.recipient_role = 'artist' THEN a.username
          WHEN ei.recipient_role = 'sessionist' THEN s.username
          ELSE NULL
        END AS recipient_username
      FROM event_invitations ei
      LEFT JOIN events e ON e.id = ei.event_id
      LEFT JOIN artist a
        ON ei.recipient_role = 'artist' AND a.id = ei.recipient_user_id
      LEFT JOIN sessionist s
        ON ei.recipient_role = 'sessionist' AND s.id = ei.recipient_user_id
      WHERE ei.organizer_id = ?
      ORDER BY ei.created_at DESC
      `,
      [authOrganizerId]
    );

    return res.json({
      items: rows,
      total: rows.length,
    });
  } catch (error: any) {
    console.error("getSentInvitations error:", error);
    return res.status(500).json({
      message: "Failed to load sent invitations",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function getReceivedInvitations(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const authUserId = Number(req.user.user_id);
    const authRole = req.user.role as UserRole;

    if (authRole !== "artist" && authRole !== "sessionist") {
      return res.status(403).json({
        message: "Only artists and sessionists can view received invitations",
      });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        ei.id,
        ei.event_id,
        ei.organizer_id,
        ei.recipient_role,
        ei.recipient_user_id,
        ei.message,
        ei.status,
        ei.created_at,
        e.title AS event_title,
        o.Organization_rep,
        o.username AS organizer_username
      FROM event_invitations ei
      LEFT JOIN events e ON e.id = ei.event_id
      LEFT JOIN organizer o ON CAST(o.id AS CHAR) = ei.organizer_id
      WHERE ei.recipient_role = ?
        AND ei.recipient_user_id = ?
      ORDER BY ei.created_at DESC
      `,
      [authRole, authUserId]
    );

    return res.json({
      items: rows,
      total: rows.length,
    });
  } catch (error: any) {
    console.error("getReceivedInvitations error:", error);
    return res.status(500).json({
      message: "Failed to load received invitations",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function updateInvitationStatus(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const invitationId = Number(req.params.id);
    const authUserId = String(req.user.user_id);
    const authRole = req.user.role as UserRole;

    if (!invitationId) {
      return res.status(400).json({ message: "Invalid invitation id" });
    }

    const parsed = updateInvitationStatusSchema.parse(req.body);

    const rows = await mysqlQuery<any[]>(
      `
      SELECT *
      FROM event_invitations
      WHERE id = ?
      LIMIT 1
      `,
      [invitationId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    const invitation = rows[0];

    if (parsed.status === "cancelled") {
      if (authRole !== "organizer" || String(invitation.organizer_id) !== authUserId) {
        return res.status(403).json({
          message: "Only the organizer who sent this invitation can cancel it",
        });
      }
    } else {
      const isRecipient =
        String(invitation.recipient_user_id) === authUserId &&
        invitation.recipient_role === authRole;

      if (!isRecipient) {
        return res.status(403).json({
          message: "Only the invited user can accept or reject this invitation",
        });
      }
    }

    await mysqlQuery(
      `
      UPDATE event_invitations
      SET status = ?
      WHERE id = ?
      `,
      [parsed.status, invitationId]
    );

    return res.json({
      message: `Invitation ${parsed.status} successfully`,
    });
  } catch (error: any) {
    console.error("updateInvitationStatus error:", error);

    if (error?.name === "ZodError") {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
      });
    }

    return res.status(500).json({
      message: "Failed to update invitation status",
      error: error?.message ?? "Unknown error",
    });
  }
}