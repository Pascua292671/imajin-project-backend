import { Request, Response } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { mysqlQuery } from "../utils/mysqlQuery";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";
type BookingStatus = "reserved" | "booked" | "cancelled";

type AuthenticatedUser = {
  id: number;
  user_id: number;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

type EventRow = RowDataPacket & {
  id: string;
  title: string;
  status: "draft" | "published" | "unpublished";
  min_price: number | string | null;
};

type BookingOwnerRow = RowDataPacket & {
  id: number;
  status: BookingStatus;
  customer_id: number;
  event_id: string;
};

type BookingListRow = RowDataPacket & {
  id: number;
  booking_code: string;
  event_id: string;
  customer_id: number;
  quantity: number;
  total_price: number | string;
  status: BookingStatus;
  reserved_at: string | null;
  booked_at: string | null;
  created_at: string;
  updated_at: string;
  title: string;
  genre: string | null;
  poster_url: string | null;
  location: string | null;
  location_name: string | null;
  event_date: string | null;
  start_date: string | null;
  end_date: string | null;
  time_text: string | null;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
};

function getAuthUser(req: Request): AuthenticatedUser | null {
  const user = req.user as AuthenticatedUser | undefined;

  if (!user) return null;
  if (!user.role) return null;
  if (user.user_id === undefined || user.user_id === null) return null;

  return user;
}

function generateBookingCode(): string {
  return `BKG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeStatus(value: unknown): BookingStatus | null {
  const status = String(value ?? "").trim().toLowerCase();

  if (status === "reserved" || status === "booked" || status === "cancelled") {
    return status;
  }

  return null;
}

export async function createBooking(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({ message: "Only customers can book events" });
    }

    const { event_id, quantity } = req.body as {
      event_id?: string;
      quantity?: number | string;
    };

    if (!event_id || typeof event_id !== "string" || !event_id.trim()) {
      return res.status(400).json({ message: "event_id is required" });
    }

    const parsedQuantity = Number(quantity ?? 1);

    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      return res.status(400).json({ message: "quantity must be a positive integer" });
    }

    const eventRows = await mysqlQuery<EventRow[]>(
      `
      SELECT
        e.id,
        e.title,
        e.status,
        COALESCE(MIN(t.price_php), 0) AS min_price
      FROM events e
      LEFT JOIN event_ticket_tiers t
        ON t.event_id = e.id
      WHERE e.id = ?
      GROUP BY e.id, e.title, e.status
      LIMIT 1
      `,
      [event_id.trim()]
    );

    if (!Array.isArray(eventRows) || eventRows.length === 0) {
      return res.status(404).json({ message: "Event not found" });
    }

    const event = eventRows[0];

    if (event.status !== "published") {
      return res.status(400).json({ message: "Only published events can be booked" });
    }

    const minPrice = Number(event.min_price ?? 0);
    const totalPrice = minPrice * parsedQuantity;
    const bookingCode = generateBookingCode();

    const insertResult = await mysqlQuery<ResultSetHeader>(
      `
      INSERT INTO event_bookings
        (booking_code, event_id, customer_id, quantity, total_price, status)
      VALUES
        (?, ?, ?, ?, ?, 'reserved')
      `,
      [
        bookingCode,
        event.id,
        Number(authUser.user_id),
        parsedQuantity,
        totalPrice,
      ]
    );

    return res.status(201).json({
      message: "Event reserved successfully",
      booking: {
        id: insertResult.insertId,
        booking_code: bookingCode,
        event_id: event.id,
        customer_id: Number(authUser.user_id),
        quantity: parsedQuantity,
        total_price: totalPrice,
        status: "reserved" as BookingStatus,
      },
    });
  } catch (error) {
    console.error("createBooking error:", error);
    return res.status(500).json({ message: "Failed to create booking" });
  }
}

export async function getMyBookings(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view bookings" });
    }

    const status = normalizeStatus(req.query.status);

    let sql = `
      SELECT
        b.id,
        b.booking_code,
        b.event_id,
        b.customer_id,
        b.quantity,
        b.total_price,
        b.status,
        b.reserved_at,
        b.booked_at,
        b.created_at,
        b.updated_at,
        e.title,
        e.genre,
        e.poster_url,
        e.location,
        e.location_name,
        e.event_date,
        e.start_date,
        e.end_date,
        e.time_text,
        e.start_time,
        e.end_time,
        e.description
      FROM event_bookings b
      INNER JOIN events e
        ON e.id = b.event_id
      WHERE b.customer_id = ?
    `;

    const values: Array<number | string> = [Number(authUser.user_id)];

    if (status) {
      sql += ` AND b.status = ?`;
      values.push(status);
    }

    sql += ` ORDER BY b.created_at DESC`;

    const rows = await mysqlQuery<BookingListRow[]>(sql, values);

    const normalized = (rows || []).map((row) => ({
      id: row.id,
      booking_code: row.booking_code,
      event_id: row.event_id,
      customer_id: row.customer_id,
      quantity: Number(row.quantity || 1),
      total_price: Number(row.total_price || 0),
      status: row.status,
      reserved_at: row.reserved_at,
      booked_at: row.booked_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      event: {
        id: row.event_id,
        title: row.title,
        genre: row.genre || "Live Event",
        image: row.poster_url || "/placeholder-event.jpg",
        location: row.location_name || row.location || "TBA",
        date: row.event_date || row.start_date || null,
        end_date: row.end_date || null,
        time: row.time_text || row.start_time || "TBA",
        end_time: row.end_time || null,
        description: row.description || "",
      },
    }));

    return res.status(200).json({
      bookings: normalized,
    });
  } catch (error) {
    console.error("getMyBookings error:", error);
    return res.status(500).json({ message: "Failed to fetch bookings" });
  }
}

export async function confirmBooking(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({ message: "Only customers can confirm bookings" });
    }

    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ message: "Invalid booking id" });
    }

    const rows = await mysqlQuery<BookingOwnerRow[]>(
      `
      SELECT
        id,
        status,
        customer_id,
        event_id
      FROM event_bookings
      WHERE id = ? AND customer_id = ?
      LIMIT 1
      `,
      [bookingId, Number(authUser.user_id)]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = rows[0];

    if (booking.status === "booked") {
      return res.status(200).json({
        message: "Booking already confirmed",
        booking: {
          id: booking.id,
          status: booking.status,
        },
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        message: "Cancelled booking cannot be confirmed",
      });
    }

    await mysqlQuery<ResultSetHeader>(
      `
      UPDATE event_bookings
      SET
        status = 'booked',
        booked_at = NOW(),
        updated_at = NOW()
      WHERE id = ? AND customer_id = ?
      `,
      [bookingId, Number(authUser.user_id)]
    );

    return res.status(200).json({
      message: "Booking confirmed successfully",
      booking: {
        id: bookingId,
        status: "booked" as BookingStatus,
      },
    });
  } catch (error) {
    console.error("confirmBooking error:", error);
    return res.status(500).json({ message: "Failed to confirm booking" });
  }
}