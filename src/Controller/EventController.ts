import { Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import cloudinary from "../databes/config/cloudinary";
import { mysqlQuery } from "../utils/mysqlQuery";
import { queryWithMirror } from "../databes/config/SupabaseDb";

type EventStatus = "draft" | "published" | "unpublished";
type UserRole = "customer" | "artist" | "sessionist" | "organizer";

type AuthenticatedUser = {
  id: number | string;
  user_id: number | string;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

/* type EventRow = {
  id: string;
  organizer_id: string | null;
  city_code: string | null;
  city: string | null;
  barangay_code: string | null;
  barangay: string | null;
  street: string | null;
  title: string;
  genre: string | null;
  poster_url: string | null;
  artists: string | string[] | null;
  time_text: string | null;
  event_date: string | null;
  location: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  status: EventStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at?: string;
  updated_at?: string;
}; */

type EventRow = {
  id: string;
  organizer_id: string | null;
  city_code: string | null;
  city: string | null;
  barangay_code: string | null;
  barangay: string | null;
  street: string | null;
  title: string;
  genre: string | null;
  poster_url: string | null;
  artists: string | string[] | null;
  time_text: string | null;
  event_date: string | null;
  location: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  gcash_account_name: string | null;
  gcash_account_number: string | null;
  status: EventStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at?: string;
  updated_at?: string;

  tickets_sold?: number | null;
  ticket_capacity?: number | null;
  revenue?: number | null;
  checked_in?: number | null;
  min_price?: number | null;
  tiers_count?: number | null;
};

/* type ParsedEventInput = {
  title: string;
  genre: string;
  location: string;
  location_name: string;
  city_code: string;
  city: string;
  barangay_code: string;
  barangay: string;
  street: string;
  latitude: number | null;
  longitude: number | null;
  time_text: string;
  event_date: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  artists: string[];
  status: EventStatus;
}; */

type ParsedEventInput = {
  title: string;
  genre: string;
  location: string;
  location_name: string;
  city_code: string;
  city: string;
  barangay_code: string;
  barangay: string;
  street: string;
  latitude: number | null;
  longitude: number | null;
  time_text: string;
  event_date: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  description: string;
  gcash_account_name: string;
  gcash_account_number: string;
  starts_at: string | null;
  ends_at: string | null;
  artists: string[];
  status: EventStatus;
};

const ENABLE_MIRROR = false;

const DraftEventSchema = z.object({
  title: z.string().trim().default(""),
  genre: z.string().trim().default(""),
  location: z.string().trim().default(""),
  location_name: z.string().trim().default(""),
  city_code: z.string().trim().default(""),
  city: z.string().trim().default(""),
  barangay_code: z.string().trim().default(""),
  barangay: z.string().trim().default(""),
  street: z.string().trim().default(""),
  latitude: z.number().nullable().optional().default(null),
  longitude: z.number().nullable().optional().default(null),
  time_text: z.string().trim().default(""),
  event_date: z.string().trim().default(""),
  start_date: z.string().trim().default(""),
  end_date: z.string().trim().default(""),
  start_time: z.string().trim().default(""),
  end_time: z.string().trim().default(""),
  description: z.string().trim().default(""),
  gcash_account_name: z.string().trim().max(150).default(""),
  gcash_account_number: z
    .string()
    .trim()
    .max(20)
    .refine((value) => !value || /^09\d{9}$/.test(value), {
      message: "GCash number must be a valid 11-digit PH mobile number",
    })
    .default(""),
  starts_at: z.string().trim().nullable().optional().default(null),
  ends_at: z.string().trim().nullable().optional().default(null),
  artists: z.array(z.string()).default([]),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

const FullEventSchema = z.object({
  title: z.string().trim().min(3, "Title is required"),
  genre: z.string().trim().min(2, "Genre is required"),
  location: z.string().trim().min(2, "Location is required"),
  location_name: z.string().trim().default(""),
  city_code: z.string().trim().default(""),
  city: z.string().trim().default(""),
  barangay_code: z.string().trim().default(""),
  barangay: z.string().trim().default(""),
  street: z.string().trim().default(""),
  latitude: z.number().nullable().optional().default(null),
  longitude: z.number().nullable().optional().default(null),
  time_text: z.string().trim().min(2, "Time is required"),
  event_date: z.string().trim().min(1, "Event date is required"),
  start_date: z.string().trim().default(""),
  end_date: z.string().trim().default(""),
  start_time: z.string().trim().default(""),
  end_time: z.string().trim().default(""),
  description: z.string().trim().min(5, "Description is required"),
  gcash_account_name: z
    .string()
    .trim()
    .min(2, "GCash account name is required"),
  gcash_account_number: z
    .string()
    .trim()
    .regex(
      /^09\d{9}$/,
      "GCash number must be a valid 11-digit PH mobile number",
    ),
  starts_at: z.string().trim().nullable().optional().default(null),
  ends_at: z.string().trim().nullable().optional().default(null),
  artists: z.array(z.string()).default([]),
  status: z.enum(["draft", "published", "unpublished"]).default("draft"),
});

function getAuthOrganizerId(req: Request): string | null {
  const user = req.user as AuthenticatedUser | undefined;

  if (!user) return null;
  if (user.role !== "organizer") return null;
  if (user.user_id === undefined || user.user_id === null) return null;

  const organizerId = String(user.user_id).trim();
  return organizerId || null;
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeNullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeStatus(value: unknown): EventStatus {
  if (value === "draft" || value === "published" || value === "unpublished") {
    return value;
  }
  return "draft";
}

function parseArtists(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof raw !== "string") return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // continue
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeArtists(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof raw !== "string" || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function isValidIsoDate(value: string | null): boolean {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function extractDateFromDateTime(value: unknown): string | null {
  const text = normalizeNullableText(value);
  if (!text) return null;

  const normalized = text.replace(" ", "T");
  const datePart = normalized.split("T")[0] ?? "";
  return isValidIsoDate(datePart) ? datePart : null;
}

function extractTimeFromRange(
  value: unknown,
  part: "start" | "end",
): string | null {
  const text = normalizeNullableText(value);
  if (!text) return null;

  const parts = text
    .split(" - ")
    .map((item) => item.trim())
    .filter(Boolean);
  return part === "start" ? (parts[0] ?? null) : (parts[1] ?? null);
}

/* function mapEventForResponse(row: EventRow) {
  return {
    id: row.id,
    organizer_id: row.organizer_id,
    city_code: row.city_code,
    city: row.city,
    barangay_code: row.barangay_code,
    barangay: row.barangay,
    street: row.street,
    title: row.title ?? "",
    genre: row.genre ?? "",
    poster_url: row.poster_url,
    artists: normalizeArtists(row.artists),
    time_text: row.time_text ?? "",
    event_date: row.event_date ?? "",
    location: row.location ?? "",
    location_name: row.location_name ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    start_date: row.start_date ?? "",
    end_date: row.end_date ?? "",
    start_time: row.start_time ?? "",
    end_time: row.end_time ?? "",
    description: row.description ?? "",
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
} */

function mapEventForResponse(row: EventRow) {
  return {
    id: row.id,
    organizer_id: row.organizer_id,
    city_code: row.city_code,
    city: row.city,
    barangay_code: row.barangay_code,
    barangay: row.barangay,
    street: row.street,
    title: row.title ?? "",
    genre: row.genre ?? "",
    poster_url: row.poster_url,
    artists: normalizeArtists(row.artists),
    time_text: row.time_text ?? "",
    event_date: row.event_date ?? "",
    location: row.location ?? "",
    location_name: row.location_name ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    start_date: row.start_date ?? "",
    end_date: row.end_date ?? "",
    start_time: row.start_time ?? "",
    end_time: row.end_time ?? "",
    description: row.description ?? "",
    gcash_account_name: row.gcash_account_name ?? "",
    gcash_account_number: row.gcash_account_number ?? "",
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    created_at: row.created_at,
    updated_at: row.updated_at,

    tickets_sold: Number(row.tickets_sold ?? 0),
    ticket_capacity: Number(row.ticket_capacity ?? 0),
    revenue: Number(row.revenue ?? 0),
    checked_in: Number(row.checked_in ?? 0),
    min_price: Number(row.min_price ?? 0),
    tiers_count: Number(row.tiers_count ?? 0),
  };
}

async function uploadPoster(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "imajin/events",
          resource_type: "image",
        },
        (error, result) => {
          if (error || !result) {
            return reject(error || new Error("Cloudinary upload failed"));
          }

          resolve(result.secure_url);
        },
      )
      .end(buffer);
  });
}

async function getOwnedEventOrNull(
  eventId: string,
  organizerId: string,
): Promise<EventRow | null> {
  const rows = await mysqlQuery<EventRow[]>(
    `
    SELECT
      id,
      organizer_id,
      city_code,
      city,
      barangay_code,
      barangay,
      street,
      title,
      genre,
      poster_url,
      artists,
      time_text,
      event_date,
      location,
      location_name,
      latitude,
      longitude,
      start_date,
      end_date,
      start_time,
      end_time,
      description,
      gcash_account_name,
      gcash_account_number,
      status,
      starts_at,
      ends_at,
      created_at,
      updated_at
    FROM events
    WHERE id = ? AND organizer_id = ?
    LIMIT 1
    `,
    [eventId, organizerId]
  );
  return rows[0] ?? null;
}

function validatePublishableEvent(event: EventRow): string | null {
  if (normalizeText(event.title).length < 3) {
    return "Title is required before publishing.";
  }

  if (normalizeText(event.genre).length < 2) {
    return "Genre is required before publishing.";
  }

  if (normalizeText(event.location).length < 2) {
    return "Location is required before publishing.";
  }

  if (normalizeText(event.time_text).length < 2) {
    return "Time is required before publishing.";
  }

  if (!normalizeText(event.event_date)) {
    return "Event date is required before publishing.";
  }

  if (normalizeText(event.description).length < 5) {
    return "Description is required before publishing.";
  }

  return null;
}

function buildEventPayload(
  body: Request["body"],
  fallback?: Partial<EventRow>,
): ParsedEventInput {
  const status = normalizeStatus(body.status ?? fallback?.status);

  const startsAt = body.starts_at ?? fallback?.starts_at ?? null;
  const endsAt = body.ends_at ?? fallback?.ends_at ?? null;
  const timeText = body.time_text ?? fallback?.time_text ?? "";
  const eventDate = body.event_date ?? fallback?.event_date ?? "";

  const payload = {
    gcash_account_name:
      body.gcash_account_name ?? fallback?.gcash_account_name ?? "",
    gcash_account_number:
      body.gcash_account_number ?? fallback?.gcash_account_number ?? "",
    title: body.title ?? fallback?.title ?? "",
    genre: body.genre ?? fallback?.genre ?? "",
    location: body.location ?? fallback?.location ?? "",
    location_name: body.location_name ?? fallback?.location_name ?? "",
    city_code: body.city_code ?? fallback?.city_code ?? "",
    city: body.city ?? fallback?.city ?? "",
    barangay_code: body.barangay_code ?? fallback?.barangay_code ?? "",
    barangay: body.barangay ?? fallback?.barangay ?? "",
    street: body.street ?? fallback?.street ?? "",
    latitude:
      body.latitude !== undefined
        ? normalizeNullableNumber(body.latitude)
        : (fallback?.latitude ?? null),
    longitude:
      body.longitude !== undefined
        ? normalizeNullableNumber(body.longitude)
        : (fallback?.longitude ?? null),
    time_text: timeText,
    event_date: eventDate,
    start_date:
      body.start_date ??
      fallback?.start_date ??
      extractDateFromDateTime(startsAt) ??
      normalizeText(eventDate),
    end_date:
      body.end_date ??
      fallback?.end_date ??
      extractDateFromDateTime(endsAt) ??
      extractDateFromDateTime(startsAt) ??
      normalizeText(eventDate),
    start_time:
      body.start_time ??
      fallback?.start_time ??
      extractTimeFromRange(timeText, "start") ??
      "",
    end_time:
      body.end_time ??
      fallback?.end_time ??
      extractTimeFromRange(timeText, "end") ??
      "",
    description: body.description ?? fallback?.description ?? "",
    starts_at: normalizeNullableText(startsAt),
    ends_at: normalizeNullableText(endsAt),
    artists:
      body.artists !== undefined
        ? parseArtists(body.artists)
        : normalizeArtists(fallback?.artists),
    status,
  };

  const schema = status === "draft" ? DraftEventSchema : FullEventSchema;
  const parsed = schema.parse(payload);

  return {
    title: parsed.title,
    genre: parsed.genre,
    location: parsed.location,
    location_name: parsed.location_name,
    city_code: parsed.city_code,
    city: parsed.city,
    barangay_code: parsed.barangay_code,
    barangay: parsed.barangay,
    street: parsed.street,
    latitude: parsed.latitude ?? null,
    longitude: parsed.longitude ?? null,
    time_text: parsed.time_text,
    event_date: parsed.event_date,
    start_date: parsed.start_date,
    end_date: parsed.end_date,
    start_time: parsed.start_time,
    end_time: parsed.end_time,
    description: parsed.description,
    starts_at: parsed.starts_at ?? null,
    ends_at: parsed.ends_at ?? null,
    artists: parsed.artists ?? [],
    status: parsed.status,
    gcash_account_name: parsed.gcash_account_name,
    gcash_account_number: parsed.gcash_account_number,
  };
}

function buildMirrorPayload(
  id: string,
  organizerId: string,
  parsed: ParsedEventInput,
  posterUrl: string | null,
) {
  return {
    id,
    organizer_id: organizerId,
    city_code: normalizeNullableText(parsed.city_code),
    city: normalizeNullableText(parsed.city),
    barangay_code: normalizeNullableText(parsed.barangay_code),
    barangay: normalizeNullableText(parsed.barangay),
    street: normalizeNullableText(parsed.street),
    title: parsed.title,
    genre: parsed.genre,
    poster_url: posterUrl,
    artists: parsed.artists,
    time_text: normalizeNullableText(parsed.time_text),
    event_date: normalizeNullableText(parsed.event_date),
    location: normalizeNullableText(parsed.location),
    location_name: normalizeNullableText(parsed.location_name),
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    start_date: normalizeNullableText(parsed.start_date),
    end_date: normalizeNullableText(parsed.end_date),
    start_time: normalizeNullableText(parsed.start_time),
    end_time: normalizeNullableText(parsed.end_time),
    description: normalizeNullableText(parsed.description),
    status: parsed.status,
    starts_at: normalizeNullableText(parsed.starts_at),
    ends_at: normalizeNullableText(parsed.ends_at),
    gcash_account_name: normalizeNullableText(parsed.gcash_account_name),
gcash_account_number: normalizeNullableText(parsed.gcash_account_number),
  };
}

function validateDateFields(parsed: ParsedEventInput): string | null {
  const eventDate = normalizeNullableText(parsed.event_date);
  const startDate = normalizeNullableText(parsed.start_date);
  const endDate = normalizeNullableText(parsed.end_date);

  if (!isValidIsoDate(eventDate)) {
    return "event_date must be YYYY-MM-DD";
  }

  if (!isValidIsoDate(startDate)) {
    return "start_date must be YYYY-MM-DD";
  }

  if (!isValidIsoDate(endDate)) {
    return "end_date must be YYYY-MM-DD";
  }

  return null;
}

export async function createEvent(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can create events" });
    }

    const parsed = buildEventPayload(req.body);
    const dateError = validateDateFields(parsed);

    if (dateError) {
      return res.status(400).json({ message: dateError });
    }

    let posterUrl: string | null = null;

    if (req.file?.buffer) {
      posterUrl = await uploadPoster(req.file.buffer);
    }

    const eventId = uuidv4();

    await mysqlQuery(
  `
  INSERT INTO events
  (
    id,
    organizer_id,
    city_code,
    city,
    barangay_code,
    barangay,
    street,
    title,
    genre,
    poster_url,
    artists,
    time_text,
    event_date,
    location,
    location_name,
    latitude,
    longitude,
    start_date,
    end_date,
    start_time,
    end_time,
    description,
    gcash_account_name,
    gcash_account_number,
    status,
    starts_at,
    ends_at,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `,
  [
    eventId,
    organizerId,
    normalizeNullableText(parsed.city_code),
    normalizeNullableText(parsed.city),
    normalizeNullableText(parsed.barangay_code),
    normalizeNullableText(parsed.barangay),
    normalizeNullableText(parsed.street),
    parsed.title,
    parsed.genre,
    posterUrl,
    JSON.stringify(parsed.artists),
    normalizeNullableText(parsed.time_text),
    normalizeNullableText(parsed.event_date),
    normalizeNullableText(parsed.location),
    normalizeNullableText(parsed.location_name),
    parsed.latitude,
    parsed.longitude,
    normalizeNullableText(parsed.start_date),
    normalizeNullableText(parsed.end_date),
    normalizeNullableText(parsed.start_time),
    normalizeNullableText(parsed.end_time),
    normalizeNullableText(parsed.description),
    normalizeNullableText(parsed.gcash_account_name),
    normalizeNullableText(parsed.gcash_account_number),
    parsed.status,
    normalizeNullableText(parsed.starts_at),
    normalizeNullableText(parsed.ends_at),
  ]
);

    if (ENABLE_MIRROR) {
      const mirrorPayload = buildMirrorPayload(
        eventId,
        organizerId,
        parsed,
        posterUrl,
      );
      queryWithMirror("events", mirrorPayload).catch((error) => {
        console.warn("mirror events failed:", error);
      });
    }

    return res.status(201).json({
      message: "Event created successfully",
      event_id: eventId,
    });
  } catch (error: any) {
    console.error("Create event failed:", error);

    return res.status(400).json({
      message: error?.message || "Create event failed",
    });
  }
}

/* export async function listEvents(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can view their events" });
    }

    const rows = await mysqlQuery<EventRow[]>(
      `
      SELECT
        id,
        organizer_id,
        city_code,
        city,
        barangay_code,
        barangay,
        street,
        title,
        genre,
        poster_url,
        artists,
        time_text,
        event_date,
        location,
        location_name,
        latitude,
        longitude,
        start_date,
        end_date,
        start_time,
        end_time,
        description,
        status,
        starts_at,
        ends_at,
        created_at,
        updated_at
      FROM events
      WHERE organizer_id = ?
      ORDER BY created_at DESC
      `,
      [organizerId],
    );

    return res.json(rows.map(mapEventForResponse));
  } catch (error: any) {
    console.error("List events failed:", error);

    return res.status(500).json({
      message: error?.message || "Failed to fetch events",
    });
  }
} */


export async function listEvents(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can view their events" });
    }

    const rows = await mysqlQuery<EventRow[]>(
      `
      SELECT
        e.id,
        e.organizer_id,
        e.city_code,
        e.city,
        e.barangay_code,
        e.barangay,
        e.street,
        e.title,
        e.genre,
        e.poster_url,
        e.artists,
        e.time_text,
        e.event_date,
        e.location,
        e.location_name,
        e.latitude,
        e.longitude,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
        e.description,
        e.gcash_account_name,
        e.gcash_account_number,
        e.status,
        e.starts_at,
        e.ends_at,
        e.created_at,
        e.updated_at,

        COALESCE(ta.ticket_capacity, 0) AS ticket_capacity,
        COALESCE(oa.tickets_sold, 0) AS tickets_sold,
        COALESCE(oa.revenue, 0) AS revenue,
        COALESCE(ca.checked_in, 0) AS checked_in,
        COALESCE(ta.min_price, 0) AS min_price,
        COALESCE(ta.tiers_count, 0) AS tiers_count

      FROM events e

      LEFT JOIN (
        SELECT
          ett.event_id,
          COALESCE(SUM(ett.capacity), 0) AS ticket_capacity,
          COALESCE(MIN(ett.price_php), 0) AS min_price,
          COUNT(*) AS tiers_count
        FROM event_ticket_tiers ett
        GROUP BY ett.event_id
      ) ta ON ta.event_id = e.id

      LEFT JOIN (
        SELECT
          o.event_id,
          COALESCE(SUM(
            CASE
              WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled'
              THEN o.qty
              ELSE 0
            END
          ), 0) AS tickets_sold,
          COALESCE(SUM(
            CASE
              WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled'
              THEN o.total_amount_php
              ELSE 0
            END
          ), 0) AS revenue
        FROM ticket_orders o
        GROUP BY o.event_id
      ) oa ON oa.event_id = e.id

      LEFT JOIN (
        SELECT
          tk.event_id,
          COUNT(*) AS checked_in
        FROM tickets tk
        WHERE tk.status = 'used'
        GROUP BY tk.event_id
      ) ca ON ca.event_id = e.id

      WHERE e.organizer_id = ?
      ORDER BY e.created_at DESC
      `,
      [organizerId]
    );

    return res.json(rows.map(mapEventForResponse));
  } catch (error: any) {
    console.error("List events failed:", error);

    return res.status(500).json({
      message: error?.message || "Failed to fetch events",
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
        e.city_code,
        e.city,
        e.barangay_code,
        e.barangay,
        e.street,
        e.title,
        e.genre,
        e.poster_url,
        e.artists,
        e.time_text,
        e.event_date,
        e.location,
        e.location_name,
        e.latitude,
        e.longitude,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
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
        e.city_code,
        e.city,
        e.barangay_code,
        e.barangay,
        e.street,
        e.title,
        e.genre,
        e.poster_url,
        e.artists,
        e.time_text,
        e.event_date,
        e.location,
        e.location_name,
        e.latitude,
        e.longitude,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
        e.description,
        e.status,
        e.starts_at,
        e.ends_at,
        e.created_at
      ORDER BY e.event_date ASC, e.created_at DESC
      `,
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        organizer_id: row.organizer_id,
        city_code: row.city_code ?? null,
        city: row.city ?? null,
        barangay_code: row.barangay_code ?? null,
        barangay: row.barangay ?? null,
        street: row.street ?? null,
        title: row.title ?? "",
        genre: row.genre || "Live Event",
        poster_url: row.poster_url ?? null,
        artists: normalizeArtists(row.artists),
        time_text: row.time_text || "TBA",
        event_date: row.event_date,
        location: row.location || "TBA",
        location_name: row.location_name || row.location || "TBA",
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
        start_time: row.start_time ?? null,
        end_time: row.end_time ?? null,
        description: row.description || "",
        status: row.status,
        starts_at: row.starts_at ?? null,
        ends_at: row.ends_at ?? null,
        price: Number(row.min_price || 0),
      })),
    );
  } catch (error: any) {
    console.error("List published events failed:", error);

    return res.status(500).json({
      message: error?.message || "Failed to fetch published events",
    });
  }
}

export async function getEventById(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);
    const eventId = String(req.params.id || "").trim();

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can view this event" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const event = await getOwnedEventOrNull(eventId, organizerId);

    if (!event) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    return res.status(200).json(mapEventForResponse(event));
  } catch (error: any) {
    console.error("Get event failed:", error);

    return res.status(500).json({
      message: error?.message || "Failed to fetch event",
    });
  }
}

export async function updateEvent(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);
    const eventId = String(req.params.id || "").trim();

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can update events" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const existingEvent = await getOwnedEventOrNull(eventId, organizerId);

    if (!existingEvent) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    const parsed = buildEventPayload(req.body, existingEvent);
    const dateError = validateDateFields(parsed);

    if (dateError) {
      return res.status(400).json({ message: dateError });
    }

    let posterUrl: string | null = existingEvent.poster_url ?? null;

    if (req.file?.buffer) {
      posterUrl = await uploadPoster(req.file.buffer);
    }

    await mysqlQuery(
      `
      UPDATE events
      SET
        organizer_id = ?,
        city_code = ?,
        city = ?,
        barangay_code = ?,
        barangay = ?,
        street = ?,
        title = ?,
        genre = ?,
        poster_url = ?,
        artists = ?,
        time_text = ?,
        event_date = ?,
        location = ?,
        location_name = ?,
        latitude = ?,
        longitude = ?,
        start_date = ?,
        end_date = ?,
        start_time = ?,
        end_time = ?,
        description = ?,
        status = ?,
        starts_at = ?,
        ends_at = ?,
        gcash_account_name = ?,
gcash_account_number = ?,
        updated_at = NOW()
      WHERE id = ? AND organizer_id = ?
      `,
      [
        organizerId,
        normalizeNullableText(parsed.city_code),
        normalizeNullableText(parsed.city),
        normalizeNullableText(parsed.barangay_code),
        normalizeNullableText(parsed.barangay),
        normalizeNullableText(parsed.street),
        parsed.title,
        parsed.genre,
        posterUrl,
        JSON.stringify(parsed.artists),
        normalizeNullableText(parsed.time_text),
        normalizeNullableText(parsed.event_date),
        normalizeNullableText(parsed.location),
        normalizeNullableText(parsed.location_name),
        parsed.latitude,
        parsed.longitude,
        normalizeNullableText(parsed.start_date),
        normalizeNullableText(parsed.end_date),
        normalizeNullableText(parsed.start_time),
        normalizeNullableText(parsed.end_time),
        normalizeNullableText(parsed.description),
        parsed.status,
        normalizeNullableText(parsed.starts_at),
        normalizeNullableText(parsed.ends_at),
        normalizeNullableText(parsed.gcash_account_name),
normalizeNullableText(parsed.gcash_account_number),
        eventId,
        organizerId,
      ],
    );

    if (ENABLE_MIRROR) {
      const mirrorPayload = buildMirrorPayload(
        eventId,
        organizerId,
        parsed,
        posterUrl,
      );
      queryWithMirror("events", mirrorPayload).catch((error) => {
        console.warn("mirror update failed:", error);
      });
    }

    return res.status(200).json({
      message: "Event updated successfully",
      id: eventId,
    });
  } catch (error: any) {
    console.error("Update event failed:", error);

    return res.status(400).json({
      message: error?.message || "Update failed",
    });
  }
}

export async function publishEvent(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);
    const eventId = String(req.params.id || "").trim();

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can publish events" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const event = await getOwnedEventOrNull(eventId, organizerId);

    if (!event) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    const validationError = validatePublishableEvent(event);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const tiers = await mysqlQuery<Array<{ id: string }>>(
      `SELECT id FROM event_ticket_tiers WHERE event_id = ? LIMIT 1`,
      [eventId],
    );

    if (!tiers.length) {
      return res.status(400).json({
        message: "Add at least 1 ticket tier before publishing.",
      });
    }

    await mysqlQuery(
      `
      UPDATE events
      SET status = 'published',
          updated_at = NOW()
      WHERE id = ? AND organizer_id = ?
      `,
      [eventId, organizerId],
    );

    if (ENABLE_MIRROR) {
      queryWithMirror("events", {
        ...mapEventForResponse(event),
        status: "published",
      }).catch((error) => {
        console.warn("mirror publish failed:", error);
      });
    }

    return res.status(200).json({
      message: "Event published successfully",
      id: eventId,
    });
  } catch (error: any) {
    console.error("Publish event failed:", error);

    return res.status(400).json({
      message: error?.message || "Publish failed",
    });
  }
}

export async function unpublishEvent(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);
    const eventId = String(req.params.id || "").trim();

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can unpublish events" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const event = await getOwnedEventOrNull(eventId, organizerId);

    if (!event) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    await mysqlQuery(
      `
      UPDATE events
      SET status = 'unpublished',
          updated_at = NOW()
      WHERE id = ? AND organizer_id = ?
      `,
      [eventId, organizerId],
    );

    if (ENABLE_MIRROR) {
      queryWithMirror("events", {
        ...mapEventForResponse(event),
        status: "unpublished",
      }).catch((error) => {
        console.warn("mirror unpublish failed:", error);
      });
    }

    return res.status(200).json({
      message: "Event unpublished successfully",
      id: eventId,
    });
  } catch (error: any) {
    console.error("Unpublish event failed:", error);

    return res.status(400).json({
      message: error?.message || "Unpublish failed",
    });
  }
}

export async function deleteEvent(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);
    const eventId = String(req.params.id || "").trim();

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can delete events" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const event = await getOwnedEventOrNull(eventId, organizerId);

    if (!event) {
      return res.status(404).json({
        message: "Event not found or you do not own this event",
      });
    }

    await mysqlQuery(`DELETE FROM event_ticket_tiers WHERE event_id = ?`, [
      eventId,
    ]);
    await mysqlQuery(`DELETE FROM events WHERE id = ? AND organizer_id = ?`, [
      eventId,
      organizerId,
    ]);

    return res.status(200).json({
      message: "Event deleted successfully",
      id: eventId,
    });
  } catch (error: any) {
    console.error("Delete event failed:", error);

    return res.status(500).json({
      message: error?.message || "Delete failed",
    });
  }
}

export async function getOrganizerRecentOrders(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res.status(403).json({ message: "Only organizers can access recent orders" });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        o.id,
        o.buyer_name,
        e.title AS event_title,
        ett.name AS tier_name,
        o.qty,
        o.total_amount_php,
        o.payment_status,
        o.order_status,
        o.created_at
      FROM ticket_orders o
      INNER JOIN events e ON e.id = o.event_id
      INNER JOIN event_ticket_tiers ett ON ett.id = o.tier_id
      WHERE e.organizer_id = ?
      ORDER BY o.created_at DESC
      LIMIT 10
      `,
      [organizerId]
    );

    return res.status(200).json({
      items: rows.map((row) => ({
        id: row.id,
        buyer_name: row.buyer_name ?? "Unknown buyer",
        event_title: row.event_title ?? "Untitled event",
        tier_name: row.tier_name ?? "Unknown tier",
        qty: Number(row.qty ?? 0),
        total_amount_php: Number(row.total_amount_php ?? 0),
        payment_status: row.payment_status ?? "pending",
        order_status: row.order_status ?? "pending",
        created_at: row.created_at,
      })),
    });
  } catch (error: any) {
    console.error("getOrganizerRecentOrders error:", error);

    return res.status(500).json({
      message: error?.message || "Failed to load recent orders",
    });
  }
}

export async function getOrganizerDashboardSummary(req: Request, res: Response) {
  try {
    const organizerId = getAuthOrganizerId(req);

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!organizerId) {
      return res
        .status(403)
        .json({ message: "Only organizers can access dashboard summary" });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        ec.total_events,
        ec.published_events,
        ec.draft_events,
        ec.unpublished_events,
        COALESCE(os.tickets_sold, 0) AS tickets_sold,
        COALESCE(os.gross_revenue, 0) AS gross_revenue,
        COALESCE(os.service_fees, 0) AS service_fees,
        COALESCE(os.net_revenue, 0) AS net_revenue
      FROM
      (
        SELECT
          COUNT(DISTINCT e.id) AS total_events,
          COUNT(DISTINCT CASE WHEN e.status = 'published' THEN e.id END) AS published_events,
          COUNT(DISTINCT CASE WHEN e.status = 'draft' THEN e.id END) AS draft_events,
          COUNT(DISTINCT CASE WHEN e.status = 'unpublished' THEN e.id END) AS unpublished_events
        FROM events e
        WHERE e.organizer_id = ?
      ) ec
      CROSS JOIN
      (
        SELECT
          COALESCE(SUM(
            CASE
              WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled'
              THEN o.qty
              ELSE 0
            END
          ), 0) AS tickets_sold,

          COALESCE(SUM(
            CASE
              WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled'
              THEN o.total_amount_php
              ELSE 0
            END
          ), 0) AS gross_revenue,

          COALESCE(SUM(
            CASE
              WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled'
              THEN o.service_fee_php
              ELSE 0
            END
          ), 0) AS service_fees,

          COALESCE(
            SUM(
              CASE
                WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled'
                THEN o.total_amount_php
                ELSE 0
              END
            ) -
            SUM(
              CASE
                WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled'
                THEN o.service_fee_php
                ELSE 0
              END
            ),
            0
          ) AS net_revenue
        FROM ticket_orders o
        INNER JOIN events e2 ON e2.id = o.event_id
        WHERE e2.organizer_id = ?
      ) os
      `,
      [organizerId, organizerId]
    );

    const row = rows[0] ?? {};

    return res.status(200).json({
      summary: {
        total_events: Number(row.total_events ?? 0),
        published_events: Number(row.published_events ?? 0),
        draft_events: Number(row.draft_events ?? 0),
        unpublished_events: Number(row.unpublished_events ?? 0),
        tickets_sold: Number(row.tickets_sold ?? 0),
        gross_revenue: Number(row.gross_revenue ?? 0),
        service_fees: Number(row.service_fees ?? 0),
        net_revenue: Number(row.net_revenue ?? 0),
      },
    });
  } catch (error: any) {
    console.error("getOrganizerDashboardSummary error:", error);

    return res.status(500).json({
      message: error?.message || "Failed to load dashboard summary",
    });
  }
}

//1//2323/123/1/31



//123123


//123123123