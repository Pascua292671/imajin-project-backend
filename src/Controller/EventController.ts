import { Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "../databes/config/cloudinary";
import { mysqlQuery } from "../utils/mysqlQuery";
import { queryWithMirror } from "../databes/config/SupabaseDb";

type EventStatus = "draft" | "published" | "unpublished";
type UserRole = "customer" | "artist" | "sessionist" | "organizer";

const ENABLE_MIRROR = false;

const DraftEventSchema = z.object({
  title: z.string().optional().default(""),
  genre: z.string().optional().default(""),
  location: z.string().optional().default(""),
  time_text: z.string().optional().default(""),
  event_date: z.string().optional().default(""),
  description: z.string().optional().default(""),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  artists: z.array(z.string()).default([]),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

const FullEventSchema = z.object({
  title: z.string().min(3, "Title is required"),
  genre: z.string().min(2, "Genre is required"),
  location: z.string().min(2, "Location is required"),
  time_text: z.string().min(2, "Time is required"),
  event_date: z.string().min(1, "Event date is required"),
  description: z.string().min(5, "Description is required"),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  artists: z.array(z.string()).default([]),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

async function uploadPoster(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: "imajin/events" }, (err, result) => {
        if (err || !result) {
          return reject(err || new Error("Cloudinary upload failed"));
        }
        resolve(result.secure_url);
      })
      .end(buffer);
  });
}

function parseArtists(rawArtists: unknown): string[] {
  if (Array.isArray(rawArtists)) {
    return rawArtists
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  if (typeof rawArtists !== "string" || !rawArtists.trim()) return [];

  try {
    const parsed = JSON.parse(rawArtists);
    return Array.isArray(parsed)
      ? parsed
          .map(String)
          .map((v) => v.trim())
          .filter(Boolean)
      : [];
  } catch {
    return rawArtists
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeArtists(raw: unknown): string[] {
  try {
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed
            .map(String)
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
    }
    return Array.isArray(raw)
      ? raw
          .map(String)
          .map((v) => v.trim())
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeStatus(value: unknown): EventStatus {
  if (value === "draft" || value === "published" || value === "unpublished") {
    return value;
  }
  return "draft";
}

function validatePublishableEvent(row: any) {
  if (!row.title || String(row.title).trim().length < 3) {
    return "Title is required before publishing.";
  }
  if (!row.genre || String(row.genre).trim().length < 2) {
    return "Genre is required before publishing.";
  }
  if (!row.location || String(row.location).trim().length < 2) {
    return "Location is required before publishing.";
  }
  if (!row.time_text || String(row.time_text).trim().length < 2) {
    return "Time is required before publishing.";
  }
  if (!row.event_date) {
    return "Event date is required before publishing.";
  }
  if (!row.description || String(row.description).trim().length < 5) {
    return "Description is required before publishing.";
  }

  return null;
}

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
  if (user.user_id === undefined || user.user_id === null) return null;

  const id = Number(user.user_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getOwnedEventOrNull(eventId: string, organizerId: number) {
  const rows = await mysqlQuery<any[]>(
    `
    SELECT
      id,
      organizer_id,
      title,
      genre,
      poster_url,
      artists,
      time_text,
      event_date,
      location,
      description,
      status,
      starts_at,
      ends_at,
      created_at,
      updated_at
    FROM events
    WHERE id = ? AND organizer_id = ?
    LIMIT 1
    `,
    [eventId, organizerId],
  );

  if (!rows.length) return null;

  return rows[0];
}

export async function createEvent(req: Request, res: Response) {
  try {
    const authOrganizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can create events" });
    }
    console.log("[createEvent] user:", req.user);
    console.log("[createEvent] body status:", req.body.status);
    const artistsParsed = parseArtists(req.body.artists);
    const status = normalizeStatus(req.body.status);
    const schema = status === "draft" ? DraftEventSchema : FullEventSchema;

    const parsed = schema.parse({
      title: req.body.title,
      genre: req.body.genre,
      location: req.body.location,
      time_text: req.body.time_text,
      event_date: req.body.event_date,
      description: req.body.description,
      starts_at: req.body.starts_at,
      ends_at: req.body.ends_at,
      artists: artistsParsed,
      status,
    });

    if (parsed.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.event_date)) {
      return res.status(400).json({ message: "event_date must be YYYY-MM-DD" });
    }

    const id = uuidv4();

    let poster_url: string | null = null;
    if (req.file?.buffer) {
      poster_url = await uploadPoster(req.file.buffer);
    }

    const safeTimeText = normalizeNullableText(parsed.time_text);
    const safeEventDate = normalizeNullableText(parsed.event_date);
    const safeStartsAt = normalizeNullableText(parsed.starts_at);
    const safeEndsAt = normalizeNullableText(parsed.ends_at);
    const safeLocation = normalizeNullableText(parsed.location);
    const safeDescription = normalizeNullableText(parsed.description);

    await mysqlQuery(
      `INSERT INTO events
       (
         id,
         organizer_id,
         title,
         genre,
         poster_url,
         artists,
         time_text,
         event_date,
         location,
         description,
         status,
         starts_at,
         ends_at,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        authOrganizerId,
        parsed.title ?? "",
        parsed.genre ?? "",
        poster_url,
        JSON.stringify(parsed.artists ?? []),
        safeTimeText,
        safeEventDate,
        safeLocation,
        safeDescription,
        parsed.status,
        safeStartsAt,
        safeEndsAt,
      ],
    );

    if (ENABLE_MIRROR) {
      queryWithMirror("events", {
        id,
        organizer_id: authOrganizerId,
        title: parsed.title ?? "",
        genre: parsed.genre ?? "",
        poster_url,
        artists: parsed.artists ?? [],
        time_text: safeTimeText,
        event_date: safeEventDate,
        location: safeLocation,
        description: safeDescription,
        status: parsed.status,
        starts_at: safeStartsAt,
        ends_at: safeEndsAt,
      }).catch((e) => console.warn("mirror events failed:", e));
    }

    return res.status(201).json({
      message: "Event created successfully",
      event_id: id,
    });

    console.log("[createEvent] created:", {
      event_id: id,
      organizer_id: authOrganizerId,
      status: parsed.status,
      title: parsed.title,
    });
  } catch (e: any) {
    console.error("Create event failed:", e);
    return res.status(400).json({
      message: e?.message || "Create event failed",
    });
  }
}

export async function listEvents(req: Request, res: Response) {
  try {
    const authOrganizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can view their events" });
    }

    const rows = await mysqlQuery<any[]>(
      `SELECT
        id,
        organizer_id,
        title,
        genre,
        poster_url,
        artists,
        time_text,
        event_date,
        location,
        description,
        status,
        starts_at,
        ends_at,
        created_at,
        updated_at
       FROM events
       WHERE organizer_id = ?
       ORDER BY created_at DESC`,
      [authOrganizerId],
    );

    const normalized = rows.map((row) => ({
      ...row,
      artists: normalizeArtists(row.artists),
    }));

    return res.json(normalized);
  } catch (e: any) {
    console.error("List events failed:", e);
    return res.status(500).json({
      message: e?.message || "Failed to fetch events",
    });
  }
}

export async function listPublishedEvents(_req: Request, res: Response) {
  try {
    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        e.id,
        e.organizer_id,
        e.title,
        e.genre,
        e.poster_url,
        e.artists,
        e.time_text,
        e.event_date,
        e.location,
        e.description,
        e.status,
        e.starts_at,
        e.ends_at,
        e.created_at,
        COALESCE(MIN(t.price_php), 0) AS min_price
      FROM events e
      LEFT JOIN event_ticket_tiers t ON t.event_id = e.id
      WHERE e.status = 'published'
        AND e.event_date IS NOT NULL
      GROUP BY
        e.id,
        e.organizer_id,
        e.title,
        e.genre,
        e.poster_url,
        e.artists,
        e.time_text,
        e.event_date,
        e.location,
        e.description,
        e.status,
        e.starts_at,
        e.ends_at,
        e.created_at
      ORDER BY e.event_date ASC, e.created_at DESC
      `,
    );

    const normalized = rows.map((row) => ({
      id: row.id,
      organizer_id: row.organizer_id,
      title: row.title,
      genre: row.genre || "Live Event",
      poster_url: row.poster_url,
      location: row.location || "TBA",
      event_date: row.event_date,
      time_text: row.time_text || "TBA",
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      price: Number(row.min_price || 0),
      description: row.description || "",
      status: row.status,
      artists: normalizeArtists(row.artists),
    }));

    return res.json(normalized);
  } catch (e: any) {
    console.error("List published events failed:", e);
    return res.status(500).json({
      message: e?.message || "Failed to fetch published events",
    });
  }
}

export async function getEventById(req: Request, res: Response) {
  try {
    const eventId = String(req.params.id || "").trim();
    const authOrganizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can view this event" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const row = await getOwnedEventOrNull(eventId, authOrganizerId);

    if (!row) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    return res.json({
      ...row,
      artists: normalizeArtists(row.artists),
    });
  } catch (e: any) {
    console.error("Get event failed:", e);
    return res.status(500).json({
      message: e?.message || "Failed to fetch event",
    });
  }
}

export async function updateEvent(req: Request, res: Response) {
  try {
    const eventId = String(req.params.id || "").trim();
    const authOrganizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can update events" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const existingEvent = await getOwnedEventOrNull(eventId, authOrganizerId);

    if (!existingEvent) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    const status = normalizeStatus(req.body.status ?? existingEvent.status);
    const schema = status === "draft" ? DraftEventSchema : FullEventSchema;

    const parsed = schema.parse({
      title: req.body.title ?? existingEvent.title,
      genre: req.body.genre ?? existingEvent.genre,
      location: req.body.location ?? existingEvent.location,
      time_text: req.body.time_text ?? existingEvent.time_text,
      event_date: req.body.event_date ?? existingEvent.event_date,
      description: req.body.description ?? existingEvent.description,
      starts_at: req.body.starts_at ?? existingEvent.starts_at,
      ends_at: req.body.ends_at ?? existingEvent.ends_at,
      artists:
        req.body.artists !== undefined
          ? parseArtists(req.body.artists)
          : normalizeArtists(existingEvent.artists),
      status,
    });

    if (parsed.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.event_date)) {
      return res.status(400).json({ message: "event_date must be YYYY-MM-DD" });
    }

    let poster_url: string | null = existingEvent.poster_url ?? null;
    if (req.file?.buffer) {
      poster_url = await uploadPoster(req.file.buffer);
    }

    const safeTimeText = normalizeNullableText(parsed.time_text);
    const safeEventDate = normalizeNullableText(parsed.event_date);
    const safeStartsAt = normalizeNullableText(parsed.starts_at);
    const safeEndsAt = normalizeNullableText(parsed.ends_at);
    const safeLocation = normalizeNullableText(parsed.location);
    const safeDescription = normalizeNullableText(parsed.description);

    await mysqlQuery(
      `UPDATE events
       SET organizer_id = ?,
           title = ?,
           genre = ?,
           poster_url = ?,
           artists = ?,
           time_text = ?,
           event_date = ?,
           location = ?,
           description = ?,
           status = ?,
           starts_at = ?,
           ends_at = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        authOrganizerId,
        parsed.title ?? "",
        parsed.genre ?? "",
        poster_url,
        JSON.stringify(parsed.artists ?? []),
        safeTimeText,
        safeEventDate,
        safeLocation,
        safeDescription,
        parsed.status,
        safeStartsAt,
        safeEndsAt,
        eventId,
      ],
    );

    if (ENABLE_MIRROR) {
      queryWithMirror("events", {
        id: eventId,
        organizer_id: authOrganizerId,
        title: parsed.title ?? "",
        genre: parsed.genre ?? "",
        poster_url,
        artists: parsed.artists ?? [],
        time_text: safeTimeText,
        event_date: safeEventDate,
        location: safeLocation,
        description: safeDescription,
        status: parsed.status,
        starts_at: safeStartsAt,
        ends_at: safeEndsAt,
      }).catch((e) => console.warn("mirror update failed:", e));
    }

    return res.json({
      message: "Event updated successfully",
      id: eventId,
    });
  } catch (e: any) {
    console.error("Update event failed:", e);
    return res.status(400).json({
      message: e?.message || "Update failed",
    });
  }
}

export async function publishEvent(req: Request, res: Response) {
  try {
    const eventId = String(req.params.id || "").trim();
    const authOrganizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can publish events" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const event = await getOwnedEventOrNull(eventId, authOrganizerId);

    if (!event) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    const publishError = validatePublishableEvent(event);
    if (publishError) {
      return res.status(400).json({ message: publishError });
    }

    const tiers: any[] = await mysqlQuery(
      `SELECT id FROM event_ticket_tiers WHERE event_id = ? LIMIT 1`,
      [eventId],
    );

    if (!tiers.length) {
      return res.status(400).json({
        message: "Add at least 1 ticket tier before publishing.",
      });
    }

    await mysqlQuery(
      `UPDATE events
       SET status = 'published',
           updated_at = NOW()
       WHERE id = ?`,
      [eventId],
    );

    if (ENABLE_MIRROR) {
      queryWithMirror("events", {
        id: event.id,
        organizer_id: event.organizer_id,
        title: event.title ?? "",
        genre: event.genre ?? "",
        poster_url: event.poster_url ?? null,
        artists: normalizeArtists(event.artists),
        time_text: event.time_text ?? null,
        event_date: event.event_date ?? null,
        location: event.location ?? null,
        description: event.description ?? null,
        status: "published",
        starts_at: event.starts_at ?? null,
        ends_at: event.ends_at ?? null,
      }).catch((e) => console.warn("mirror publish failed:", e));
    }

    return res.json({
      message: "Event published successfully",
      id: eventId,
    });
  } catch (e: any) {
    console.error("Publish failed:", e);
    return res.status(400).json({
      message: e?.message || "Publish failed",
    });
  }
}

export async function unpublishEvent(req: Request, res: Response) {
  try {
    const eventId = String(req.params.id || "").trim();
    const authOrganizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can unpublish events" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const event = await getOwnedEventOrNull(eventId, authOrganizerId);

    if (!event) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    await mysqlQuery(
      `UPDATE events
       SET status = 'unpublished',
           updated_at = NOW()
       WHERE id = ?`,
      [eventId],
    );

    if (ENABLE_MIRROR) {
      queryWithMirror("events", {
        id: event.id,
        organizer_id: event.organizer_id,
        title: event.title ?? "",
        genre: event.genre ?? "",
        poster_url: event.poster_url ?? null,
        artists: normalizeArtists(event.artists),
        time_text: event.time_text ?? null,
        event_date: event.event_date ?? null,
        location: event.location ?? null,
        description: event.description ?? null,
        status: "unpublished",
        starts_at: event.starts_at ?? null,
        ends_at: event.ends_at ?? null,
      }).catch((e) => console.warn("mirror unpublish failed:", e));
    }

    return res.json({
      message: "Event unpublished successfully",
      id: eventId,
    });
  } catch (e: any) {
    console.error("Unpublish failed:", e);
    return res.status(400).json({
      message: e?.message || "Unpublish failed",
    });
  }
}

export async function deleteEvent(req: Request, res: Response) {
  try {
    const eventId = String(req.params.id || "").trim();
    const authOrganizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!authOrganizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can delete events" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const event = await getOwnedEventOrNull(eventId, authOrganizerId);

    if (!event) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    await mysqlQuery(`DELETE FROM event_ticket_tiers WHERE event_id = ?`, [
      eventId,
    ]);
    await mysqlQuery(`DELETE FROM events WHERE id = ?`, [eventId]);

    return res.json({
      message: "Event deleted successfully",
      id: eventId,
    });
  } catch (e: any) {
    console.error("Delete event failed:", e);
    return res.status(500).json({
      message: e?.message || "Delete failed",
    });
  }
}
