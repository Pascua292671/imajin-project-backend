import { Request, Response } from "express";
import { RowDataPacket } from "mysql2";
import { mysqlQuery } from "../utils/mysqlQuery";

type AuthUser = {
  id?: number | string;
  user_id?: number | string;
  role?: string;
};

type EventOwnerRow = RowDataPacket & {
  id: string;
  organizer_id: string | number;
  title?: string | null; 
};

type AttendanceStatsRow = RowDataPacket & {
  totalOrders: number | null;
  ticketsSold: number | null;
  totalRevenue: number | null;
  totalTickets: number | null;
  scannedTickets: number | null;
};

type AttendanceRecentRow = RowDataPacket & {
  ticket_id: string;
  order_id: string;
  receipt_no: string | null;
  event_id: string;
  tier_id: string;
  tier_name: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  payment_method: "gcash" | "card" | "cash" | null;
  payment_status: "pending" | "paid" | "failed" | "refunded";
  order_status: "pending" | "confirmed" | "cancelled";
  ticket_status: "active" | "used" | "cancelled";
  checked_in_at: string | null;
};

export async function getAttendanceDashboard(req: Request, res: Response) {
  try {
    const user = req.user as AuthUser | undefined;
    const eventId = String(req.params.eventId ?? "").trim();

    if (!user || user.role !== "organizer") {
      return res.status(403).json({
        ok: false,
        message: "Organizer access required",
      });
    }

    const organizerId = String(user.user_id ?? user.id ?? "").trim();

    if (!organizerId) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        ok: false,
        message: "Event ID is required",
      });
    }

    const eventRows = await mysqlQuery<EventOwnerRow[]>(
      `
      SELECT id, organizer_id, title
      FROM events
      WHERE id = ?
      LIMIT 1
      `,
      [eventId]
    );

    if (!eventRows.length) {
      return res.status(404).json({
        ok: false,
        message: "Event not found",
      });
    }

    const event = eventRows[0];

    if (String(event.organizer_id) !== organizerId) {
      return res.status(403).json({
        ok: false,
        message: "You do not have access to this event attendance",
      });
    }

    const statsRows = await mysqlQuery<AttendanceStatsRow[]>(
      `
      SELECT
        COUNT(DISTINCT CASE
          WHEN o.order_status <> 'cancelled' THEN o.id
        END) AS totalOrders,

        COALESCE(SUM(CASE
          WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled' THEN o.qty
          ELSE 0
        END), 0) AS ticketsSold,

        COALESCE(SUM(CASE
          WHEN o.payment_status = 'paid' AND o.order_status <> 'cancelled' THEN o.total_amount_php
          ELSE 0
        END), 0) AS totalRevenue,

        COUNT(CASE
          WHEN t.status <> 'cancelled' AND o.order_status <> 'cancelled' THEN 1
        END) AS totalTickets,

        COUNT(CASE
          WHEN t.status = 'used' AND t.checked_in_at IS NOT NULL AND o.order_status <> 'cancelled' THEN 1
        END) AS scannedTickets
      FROM ticket_orders o
      LEFT JOIN tickets t ON t.order_id = o.id
      WHERE o.event_id = ?
      `,
      [eventId]
    );

    const recentRows = await mysqlQuery<AttendanceRecentRow[]>(
      `
      SELECT
        t.id AS ticket_id,
        t.order_id,
        o.receipt_no,
        t.event_id,
        t.tier_id,
        ett.name AS tier_name,
        o.buyer_name,
        o.buyer_email,
        o.payment_method,
        o.payment_status,
        o.order_status,
        t.status AS ticket_status,
        t.checked_in_at
      FROM tickets t
      INNER JOIN ticket_orders o ON o.id = t.order_id
      LEFT JOIN event_ticket_tiers ett ON ett.id = t.tier_id
      WHERE t.event_id = ?
        AND t.checked_in_at IS NOT NULL
        AND t.status = 'used'
        AND o.order_status <> 'cancelled'
      ORDER BY t.checked_in_at DESC
      LIMIT 50
      `,
      [eventId]
    );

    const stats = statsRows[0] ?? {
      totalOrders: 0,
      ticketsSold: 0,
      totalRevenue: 0,
      totalTickets: 0,
      scannedTickets: 0,
    };

    const totalOrders = Number(stats.totalOrders || 0);
    const ticketsSold = Number(stats.ticketsSold || 0);
    const totalRevenue = Number(stats.totalRevenue || 0);
    const totalTickets = Number(stats.totalTickets || 0);
    const scannedTickets = Number(stats.scannedTickets || 0);
    const remainingTickets = Math.max(totalTickets - scannedTickets, 0);
    const attendanceRate =
      totalTickets > 0
        ? Number(((scannedTickets / totalTickets) * 100).toFixed(2))
        : 0;

    return res.status(200).json({
      ok: true,
      data: {
        event: {
          id: event.id,
          title: event.title ?? null,
        },
        summary: {
          totalOrders,
          totalRevenue,
          ticketsSold,
          totalTickets,
          scannedTickets,
          remainingTickets,
          attendanceRate,
        },
        recentScans: recentRows,
      },
    });
  } catch (error) {
    console.error("[getAttendanceDashboard] error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to load attendance dashboard",
    });
  }
}