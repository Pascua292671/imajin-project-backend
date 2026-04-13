import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { mysqlQuery } from "../utils/mysqlQuery";

type UserRole = "artist" | "sessionist";

type AuthenticatedUser = {
  id: number | string;
  user_id: number | string;
  role: "customer" | "artist" | "sessionist" | "organizer";
  email?: string | null;
  username?: string | null;
};

const availabilityTypeSchema = z.enum([
  "available",
  "blocked",
  "booked",
  "pending",
]);

const bookingSourceSchema = z.enum([
  "manual",
  "customer_booking",
  "organizer_invite",
]);

const createAvailabilitySchema = z.object({
  availability_type: availabilityTypeSchema,
  event_title: z.string().trim().max(150).nullable().optional().or(z.literal("")),
  event_type: z.string().trim().max(100).nullable().optional().or(z.literal("")),
  booking_source: bookingSourceSchema.optional(),
  booking_reference_id: z
    .string()
    .trim()
    .max(36)
    .nullable()
    .optional()
    .or(z.literal("")),
  date_start: z.string().trim().min(1),
  date_end: z.string().trim().min(1),
  time_start: z.string().trim().nullable().optional().or(z.literal("")),
  time_end: z.string().trim().nullable().optional().or(z.literal("")),
  notes: z.string().trim().nullable().optional().or(z.literal("")),
});

const updateAvailabilitySchema = createAvailabilitySchema.partial();

function normalizeEmptyString(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizePayload<T extends Record<string, any>>(payload: T): T {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(payload)) {
    normalized[key] = normalizeEmptyString(value);
  }

  return normalized as T;
}

function getAuthUser(req: Request): AuthenticatedUser | null {
  const user = req.user as AuthenticatedUser | undefined;
  if (!user) return null;
  if (!user.role) return null;
  if (user.user_id === undefined || user.user_id === null) return null;
  return user;
}

function ensurePerformerRole(role: string): role is UserRole {
  return role === "artist" || role === "sessionist";
}

function isValidDate(value: string | null | undefined) {
  if (!value) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function isValidTime(value: string | null | undefined) {
  if (!value) return true;
  return /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(value);
}

function normalizeTimeForDb(value: string | null | undefined) {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

function hasDateOverlap(
  existingStartDate: string,
  existingEndDate: string,
  newStartDate: string,
  newEndDate: string
) {
  return existingStartDate <= newEndDate && existingEndDate >= newStartDate;
}

function hasTimeOverlap(
  existingStartTime: string | null,
  existingEndTime: string | null,
  newStartTime: string | null,
  newEndTime: string | null
) {
  if (!existingStartTime || !existingEndTime || !newStartTime || !newEndTime) {
    return true;
  }

  return existingStartTime < newEndTime && existingEndTime > newStartTime;
}

async function getConflictingSlots(params: {
  role: UserRole;
  userId: number;
  dateStart: string;
  dateEnd: string;
  timeStart: string | null;
  timeEnd: string | null;
  excludeId?: string;
}) {
  const { role, userId, dateStart, dateEnd, timeStart, timeEnd, excludeId } = params;

  const rows = await mysqlQuery<any[]>(
    `
    SELECT
      id,
      availability_type,
      date_start,
      date_end,
      time_start,
      time_end
    FROM performer_availability
    WHERE role = ?
      AND user_id = ?
      AND availability_type IN ('blocked', 'booked', 'pending')
      AND date_start <= ?
      AND date_end >= ?
      ${excludeId ? "AND id <> ?" : ""}
    `,
    excludeId
      ? [role, userId, dateEnd, dateStart, excludeId]
      : [role, userId, dateEnd, dateStart]
  );

  return rows.filter((row) => {
    const dateOverlap = hasDateOverlap(
      row.date_start,
      row.date_end,
      dateStart,
      dateEnd
    );

    if (!dateOverlap) return false;

    return hasTimeOverlap(
      row.time_start,
      row.time_end,
      timeStart,
      timeEnd
    );
  });
}

export async function getMyAvailability(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!ensurePerformerRole(authUser.role)) {
      return res.status(403).json({
        message: "Only artist and sessionist accounts can manage availability",
      });
    }

    const userId = Number(authUser.user_id);
    const role = authUser.role;

    const month = String(req.query.month || "").trim();

    let sql = `
      SELECT
        id,
        role,
        user_id,
        availability_type,
        event_title,
        event_type,
        booking_source,
        booking_reference_id,
        date_start,
        date_end,
        time_start,
        time_end,
        notes,
        created_at,
        updated_at
      FROM performer_availability
      WHERE role = ?
        AND user_id = ?
    `;
    const values: any[] = [role, userId];

    if (month) {
      sql += `
        AND DATE_FORMAT(date_start, '%Y-%m') <= ?
        AND DATE_FORMAT(date_end, '%Y-%m') >= ?
      `;
      values.push(month, month);
    }

    sql += `
      ORDER BY date_start ASC, time_start ASC, created_at ASC
    `;

    const rows = await mysqlQuery<any[]>(sql, values);

    return res.status(200).json({
      role,
      items: rows,
    });
  } catch (error: any) {
    console.error("getMyAvailability error:", error);
    return res.status(500).json({
      message: "Failed to load availability",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function createMyAvailability(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!ensurePerformerRole(authUser.role)) {
      return res.status(403).json({
        message: "Only artist and sessionist accounts can manage availability",
      });
    }

    const userId = Number(authUser.user_id);
    const role = authUser.role;

    const parsed = normalizePayload(createAvailabilitySchema.parse(req.body));

    const dateStart = String(parsed.date_start);
    const dateEnd = String(parsed.date_end);
    const timeStart = normalizeTimeForDb(parsed.time_start as string | null);
    const timeEnd = normalizeTimeForDb(parsed.time_end as string | null);

    if (!isValidDate(dateStart) || !isValidDate(dateEnd)) {
      return res.status(400).json({
        message: "Invalid date_start or date_end",
      });
    }

    if (dateStart > dateEnd) {
      return res.status(400).json({
        message: "date_end cannot be earlier than date_start",
      });
    }

    if (!isValidTime(timeStart) || !isValidTime(timeEnd)) {
      return res.status(400).json({
        message: "Invalid time_start or time_end",
      });
    }

    if ((timeStart && !timeEnd) || (!timeStart && timeEnd)) {
      return res.status(400).json({
        message: "time_start and time_end must both be provided together",
      });
    }

    if (timeStart && timeEnd && timeStart >= timeEnd) {
      return res.status(400).json({
        message: "time_end must be later than time_start",
      });
    }

    if (parsed.availability_type !== "available") {
      const conflicts = await getConflictingSlots({
        role,
        userId,
        dateStart,
        dateEnd,
        timeStart,
        timeEnd,
      });

      if (conflicts.length > 0) {
        return res.status(409).json({
          message: "Availability conflict detected",
          conflicts,
        });
      }
    }

    const id = uuidv4();

    await mysqlQuery(
      `
      INSERT INTO performer_availability (
        id,
        role,
        user_id,
        availability_type,
        event_title,
        event_type,
        booking_source,
        booking_reference_id,
        date_start,
        date_end,
        time_start,
        time_end,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        role,
        userId,
        parsed.availability_type,
        parsed.event_title ?? null,
        parsed.event_type ?? null,
        parsed.booking_source ?? "manual",
        parsed.booking_reference_id ?? null,
        dateStart,
        dateEnd,
        timeStart,
        timeEnd,
        parsed.notes ?? null,
      ]
    );

    const rows = await mysqlQuery<any[]>(
      `
      SELECT *
      FROM performer_availability
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.status(201).json({
      message: "Availability created successfully",
      item: rows[0] ?? null,
    });
  } catch (error: any) {
    console.error("createMyAvailability error:", error);

    if (error?.name === "ZodError") {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
      });
    }

    return res.status(500).json({
      message: "Failed to create availability",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function updateMyAvailability(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!ensurePerformerRole(authUser.role)) {
      return res.status(403).json({
        message: "Only artist and sessionist accounts can manage availability",
      });
    }

    const userId = Number(authUser.user_id);
    const role = authUser.role;
    const availabilityId = String(req.params.id || "").trim();

    if (!availabilityId) {
      return res.status(400).json({ message: "Availability id is required" });
    }

    const existingRows = await mysqlQuery<any[]>(
      `
      SELECT *
      FROM performer_availability
      WHERE id = ?
        AND role = ?
        AND user_id = ?
      LIMIT 1
      `,
      [availabilityId, role, userId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Availability not found" });
    }

    const existing = existingRows[0];

    const parsed = normalizePayload(updateAvailabilitySchema.parse(req.body));

    const merged = {
      availability_type:
        parsed.availability_type ?? existing.availability_type,
      event_title:
        parsed.event_title !== undefined ? parsed.event_title : existing.event_title,
      event_type:
        parsed.event_type !== undefined ? parsed.event_type : existing.event_type,
      booking_source:
        parsed.booking_source ?? existing.booking_source,
      booking_reference_id:
        parsed.booking_reference_id !== undefined
          ? parsed.booking_reference_id
          : existing.booking_reference_id,
      date_start: parsed.date_start ?? existing.date_start,
      date_end: parsed.date_end ?? existing.date_end,
      time_start:
        parsed.time_start !== undefined ? parsed.time_start : existing.time_start,
      time_end:
        parsed.time_end !== undefined ? parsed.time_end : existing.time_end,
      notes: parsed.notes !== undefined ? parsed.notes : existing.notes,
    };

    const dateStart = String(merged.date_start);
    const dateEnd = String(merged.date_end);
    const timeStart = normalizeTimeForDb(merged.time_start as string | null);
    const timeEnd = normalizeTimeForDb(merged.time_end as string | null);

    if (!isValidDate(dateStart) || !isValidDate(dateEnd)) {
      return res.status(400).json({
        message: "Invalid date_start or date_end",
      });
    }

    if (dateStart > dateEnd) {
      return res.status(400).json({
        message: "date_end cannot be earlier than date_start",
      });
    }

    if (!isValidTime(timeStart) || !isValidTime(timeEnd)) {
      return res.status(400).json({
        message: "Invalid time_start or time_end",
      });
    }

    if ((timeStart && !timeEnd) || (!timeStart && timeEnd)) {
      return res.status(400).json({
        message: "time_start and time_end must both be provided together",
      });
    }

    if (timeStart && timeEnd && timeStart >= timeEnd) {
      return res.status(400).json({
        message: "time_end must be later than time_start",
      });
    }

    if (merged.availability_type !== "available") {
      const conflicts = await getConflictingSlots({
        role,
        userId,
        dateStart,
        dateEnd,
        timeStart,
        timeEnd,
        excludeId: availabilityId,
      });

      if (conflicts.length > 0) {
        return res.status(409).json({
          message: "Availability conflict detected",
          conflicts,
        });
      }
    }

    await mysqlQuery(
      `
      UPDATE performer_availability
      SET
        availability_type = ?,
        event_title = ?,
        event_type = ?,
        booking_source = ?,
        booking_reference_id = ?,
        date_start = ?,
        date_end = ?,
        time_start = ?,
        time_end = ?,
        notes = ?
      WHERE id = ?
        AND role = ?
        AND user_id = ?
      `,
      [
        merged.availability_type,
        merged.event_title ?? null,
        merged.event_type ?? null,
        merged.booking_source ?? "manual",
        merged.booking_reference_id ?? null,
        dateStart,
        dateEnd,
        timeStart,
        timeEnd,
        merged.notes ?? null,
        availabilityId,
        role,
        userId,
      ]
    );

    const rows = await mysqlQuery<any[]>(
      `
      SELECT *
      FROM performer_availability
      WHERE id = ?
      LIMIT 1
      `,
      [availabilityId]
    );

    return res.status(200).json({
      message: "Availability updated successfully",
      item: rows[0] ?? null,
    });
  } catch (error: any) {
    console.error("updateMyAvailability error:", error);

    if (error?.name === "ZodError") {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
      });
    }

    return res.status(500).json({
      message: "Failed to update availability",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function deleteMyAvailability(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!ensurePerformerRole(authUser.role)) {
      return res.status(403).json({
        message: "Only artist and sessionist accounts can manage availability",
      });
    }

    const userId = Number(authUser.user_id);
    const role = authUser.role;
    const availabilityId = String(req.params.id || "").trim();

    if (!availabilityId) {
      return res.status(400).json({ message: "Availability id is required" });
    }

    const existingRows = await mysqlQuery<any[]>(
      `
      SELECT id, booking_source, availability_type
      FROM performer_availability
      WHERE id = ?
        AND role = ?
        AND user_id = ?
      LIMIT 1
      `,
      [availabilityId, role, userId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Availability not found" });
    }

    const existing = existingRows[0];

    if (
      existing.booking_source !== "manual" &&
      (existing.availability_type === "booked" ||
        existing.availability_type === "pending")
    ) {
      return res.status(400).json({
        message:
          "This availability entry is linked to a booking/invite flow and cannot be deleted manually",
      });
    }

    await mysqlQuery(
      `
      DELETE FROM performer_availability
      WHERE id = ?
        AND role = ?
        AND user_id = ?
      `,
      [availabilityId, role, userId]
    );

    return res.status(200).json({
      message: "Availability deleted successfully",
    });
  } catch (error: any) {
    console.error("deleteMyAvailability error:", error);
    return res.status(500).json({
      message: "Failed to delete availability",
      error: error?.message ?? "Unknown error",
    });
  }
}