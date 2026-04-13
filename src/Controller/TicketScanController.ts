import { Request, Response } from "express";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { mysqlQuery } from "../utils/mysqlQuery";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

type AuthenticatedUser = {
  id: number | string;
  user_id: number | string;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

type ScanAction = "ALLOW_ENTRY" | "PAY_AT_GATE" | "DENY_ENTRY";

type ParsedQrPayload = {
  type: "IMAJIN_TICKET";
  qrToken: string;
  ticketId?: string;
  orderId?: string;
  eventId?: string;
  tierId?: string;
};

interface TicketScanRow extends RowDataPacket {
  ticket_id: string;
  order_id: string;
  event_id: string;
  tier_id: string;
  buyer_id: string | null;
  qr_token: string;
  ticket_status: "active" | "used" | "cancelled";
  checked_in_at: string | null;

  order_payment_status: "pending" | "partial" | "paid" | "failed" | "refunded";
  order_status: "pending" | "confirmed" | "cancelled" | "expired";
  payment_method: "gcash" | "cash" | "card" | string;

  buyer_name: string | null;
  buyer_email: string | null;
  receipt_no: string | null;
  qty: number;
  total_amount_php: number | null;
  paid_amount_php: number | null;
  remaining_amount_php: number | null;

  scanned_at: string | null;
  scanned_by: string | null;

  event_title: string;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  tier_name: string | null;
  organizer_id: string;
}

function getAuthUser(req: Request): AuthenticatedUser | null {
  const user = req.user as AuthenticatedUser | undefined;

  if (!user) return null;
  if (user.user_id === undefined || user.user_id === null) return null;
  if (!user.role) return null;

  return user;
}

function parseQrPayload(raw: unknown): ParsedQrPayload | null {
  if (typeof raw !== "string" || !raw.trim()) return null;

  const value = raw.trim();

  // Preferred compact text format:
  // IMAJIN_TICKET:<qrToken>
  if (value.startsWith("IMAJIN_TICKET:")) {
    const qrToken = value.slice("IMAJIN_TICKET:".length).trim();

    if (!qrToken) return null;

    return {
      type: "IMAJIN_TICKET",
      qrToken,
    };
  }

  // JSON formats (new short JSON + old full JSON)
  try {
    const parsed = JSON.parse(value) as Partial<ParsedQrPayload>;

    if (parsed?.type !== "IMAJIN_TICKET") {
      return null;
    }

    if (typeof parsed.qrToken !== "string" || !parsed.qrToken.trim()) {
      return null;
    }

    return {
      type: "IMAJIN_TICKET",
      qrToken: parsed.qrToken.trim(),
      ticketId:
        typeof parsed.ticketId === "string" && parsed.ticketId.trim()
          ? parsed.ticketId.trim()
          : undefined,
      orderId:
        typeof parsed.orderId === "string" && parsed.orderId.trim()
          ? parsed.orderId.trim()
          : undefined,
      eventId:
        typeof parsed.eventId === "string" && parsed.eventId.trim()
          ? parsed.eventId.trim()
          : undefined,
      tierId:
        typeof parsed.tierId === "string" && parsed.tierId.trim()
          ? parsed.tierId.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

async function findTicketForScan(qrPayload: ParsedQrPayload) {
  const rows = await mysqlQuery<TicketScanRow[]>(
    `
    SELECT
      t.id AS ticket_id,
      t.order_id,
      t.event_id,
      t.tier_id,
      t.buyer_id,
      t.qr_token,
      t.status AS ticket_status,
      t.checked_in_at,

      o.payment_status AS order_payment_status,
      o.order_status,
      o.payment_method,
      o.buyer_name,
      o.buyer_email,
      o.receipt_no,
      o.qty,
      o.total_amount_php,
      o.paid_amount_php,
      o.remaining_amount_php,
      o.scanned_at,
      o.scanned_by,

      e.title AS event_title,
      e.event_date,
      e.time_text AS event_time,
      e.location AS event_location,
      ett.name AS tier_name,
      e.organizer_id
    FROM tickets t
    INNER JOIN ticket_orders o ON o.id = t.order_id
    INNER JOIN events e ON e.id = t.event_id
    INNER JOIN event_ticket_tiers ett ON ett.id = t.tier_id
    WHERE t.qr_token = ?
    LIMIT 1
    `,
    [qrPayload.qrToken]
  );

  const ticket = rows[0] ?? null;
  if (!ticket) return null;

  // Optional extra checks for backward compatibility if old QR includes IDs
  if (qrPayload.ticketId && ticket.ticket_id !== qrPayload.ticketId) return null;
  if (qrPayload.orderId && ticket.order_id !== qrPayload.orderId) return null;
  if (qrPayload.eventId && ticket.event_id !== qrPayload.eventId) return null;
  if (qrPayload.tierId && ticket.tier_id !== qrPayload.tierId) return null;

  return ticket;
}

async function findTicketByIds(ticketId: string, orderId: string, eventId: string) {
  const rows = await mysqlQuery<TicketScanRow[]>(
    `
    SELECT
      t.id AS ticket_id,
      t.order_id,
      t.event_id,
      t.tier_id,
      t.buyer_id,
      t.qr_token,
      t.status AS ticket_status,
      t.checked_in_at,

      o.payment_status AS order_payment_status,
      o.order_status,
      o.payment_method,
      o.buyer_name,
      o.buyer_email,
      o.receipt_no,
      o.qty,
      o.total_amount_php,
      o.paid_amount_php,
      o.remaining_amount_php,
      o.scanned_at,
      o.scanned_by,

      e.title AS event_title,
      e.event_date,
      e.time_text AS event_time,
      e.location AS event_location,
      ett.name AS tier_name,
      e.organizer_id
    FROM tickets t
    INNER JOIN ticket_orders o ON o.id = t.order_id
    INNER JOIN events e ON e.id = t.event_id
    INNER JOIN event_ticket_tiers ett ON ett.id = t.tier_id
    WHERE t.id = ?
      AND t.order_id = ?
      AND t.event_id = ?
    LIMIT 1
    `,
    [ticketId, orderId, eventId]
  );

  return rows[0] ?? null;
}

async function findTicketByQrToken(qrToken: string) {
  const rows = await mysqlQuery<TicketScanRow[]>(
    `
    SELECT
      t.id AS ticket_id,
      t.order_id,
      t.event_id,
      t.tier_id,
      t.buyer_id,
      t.qr_token,
      t.status AS ticket_status,
      t.checked_in_at,

      o.payment_status AS order_payment_status,
      o.order_status,
      o.payment_method,
      o.buyer_name,
      o.buyer_email,
      o.receipt_no,
      o.qty,
      o.total_amount_php,
      o.paid_amount_php,
      o.remaining_amount_php,
      o.scanned_at,
      o.scanned_by,

      e.title AS event_title,
      e.event_date,
      e.time_text AS event_time,
      e.location AS event_location,
      ett.name AS tier_name,
      e.organizer_id
    FROM tickets t
    INNER JOIN ticket_orders o ON o.id = t.order_id
    INNER JOIN events e ON e.id = t.event_id
    INNER JOIN event_ticket_tiers ett ON ett.id = t.tier_id
    WHERE t.qr_token = ?
    LIMIT 1
    `,
    [qrToken]
  );

  return rows[0] ?? null;
}

function buildTicketPayload(ticket: TicketScanRow) {
  return {
    id: ticket.ticket_id,
    orderId: ticket.order_id,
    eventId: ticket.event_id,
    tierId: ticket.tier_id,
    qrToken: ticket.qr_token,
    receiptNo: ticket.receipt_no,
    eventTitle: ticket.event_title,
    eventDate: ticket.event_date,
    eventTime: ticket.event_time,
    eventLocation: ticket.event_location,
    tierName: ticket.tier_name,
    buyerName: ticket.buyer_name,
    buyerEmail: ticket.buyer_email,
    paymentMethod: ticket.payment_method,
    paymentStatus: ticket.order_payment_status,
    orderStatus: ticket.order_status,
    status: ticket.ticket_status,
    checkedInAt: ticket.checked_in_at,
    scannedAt: ticket.scanned_at,
    scannedBy: ticket.scanned_by,
    qty: Number(ticket.qty ?? 0),
    totalAmountPhp: Number(ticket.total_amount_php ?? 0),
    paidAmountPhp: Number(ticket.paid_amount_php ?? 0),
    remainingAmountPhp: Number(ticket.remaining_amount_php ?? 0),
  };
}

function deny(
  res: Response,
  statusCode: number,
  message: string,
  ticket?: TicketScanRow | null
) {
  return res.status(statusCode).json({
    valid: false,
    action: "DENY_ENTRY" as ScanAction,
    message,
    ticket: ticket ? buildTicketPayload(ticket) : null,
  });
}

export async function scanTicketQr(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return deny(res, 401, "Unauthorized");
    }

    if (authUser.role !== "organizer") {
      return deny(res, 403, "Organizer access required");
    }

    const rawQrData =
      typeof req.body?.qrData === "string"
        ? req.body.qrData
        : typeof req.body?.qr === "string"
        ? req.body.qr
        : typeof req.body?.qr_code === "string"
        ? req.body.qr_code
        : "";

    if (!rawQrData) {
      return deny(res, 400, "QR data is required");
    }

    const qrPayload = parseQrPayload(rawQrData);

    if (!qrPayload) {
      return deny(res, 400, "Invalid QR code payload");
    }

    const organizerId = String(authUser.user_id);
    const ticket = await findTicketForScan(qrPayload);

    if (!ticket) {
      return deny(res, 404, "Ticket not found or QR is invalid");
    }

    if (String(ticket.organizer_id) !== organizerId) {
      return deny(
        res,
        403,
        "You do not have access to scan tickets for this event",
        ticket
      );
    }

    if (ticket.order_status === "cancelled") {
      return deny(res, 400, "Order has been cancelled", ticket);
    }

    if (ticket.order_status === "expired") {
      return deny(res, 400, "Order has already expired", ticket);
    }

    if (ticket.ticket_status === "cancelled") {
      return deny(res, 400, "Ticket has been cancelled", ticket);
    }

    if (ticket.ticket_status === "used" || ticket.checked_in_at) {
      return deny(res, 409, "Ticket already used", ticket);
    }

    if (ticket.payment_method === "cash" && ticket.order_payment_status !== "paid") {
      return res.status(200).json({
        valid: true,
        action: "PAY_AT_GATE" as ScanAction,
        message: "Cash payment required before entry",
        ticket: buildTicketPayload(ticket),
      });
    }

    if (ticket.order_payment_status !== "paid") {
      return deny(res, 400, "Ticket is not fully paid", ticket);
    }

    await mysqlQuery<ResultSetHeader>(
      `
      UPDATE ticket_orders
      SET
        scanned_at = NOW(),
        scanned_by = ?
      WHERE id = ?
        AND event_id = ?
      `,
      [organizerId, ticket.order_id, ticket.event_id]
    );

    const ticketUpdate = await mysqlQuery<ResultSetHeader>(
      `
      UPDATE tickets
      SET
        status = 'used',
        checked_in_at = NOW()
      WHERE id = ?
        AND event_id = ?
        AND status = 'active'
        AND checked_in_at IS NULL
      `,
      [ticket.ticket_id, ticket.event_id]
    );

    if (Number(ticketUpdate?.affectedRows ?? 0) === 0) {
      return deny(res, 409, "Ticket already used or no longer active", ticket);
    }

    const refreshed = await findTicketByQrToken(ticket.qr_token);

    if (!refreshed) {
      return deny(res, 500, "Ticket verified but could not be reloaded");
    }

    return res.status(200).json({
      valid: true,
      action: "ALLOW_ENTRY" as ScanAction,
      message: "Ticket verified. Entry allowed.",
      ticket: buildTicketPayload(refreshed),
    });
  } catch (error) {
    console.error("scanTicketQr error:", error);

    return deny(res, 500, "Failed to scan ticket");
  }
}

export async function confirmCashTicketPaymentAndEntry(
  req: Request,
  res: Response
) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return deny(res, 401, "Unauthorized");
    }

    if (authUser.role !== "organizer") {
      return deny(res, 403, "Organizer access required");
    }

    const ticketId =
      typeof req.body?.ticketId === "string" ? req.body.ticketId.trim() : "";
    const orderId =
      typeof req.body?.orderId === "string" ? req.body.orderId.trim() : "";
    const eventId =
      typeof req.body?.eventId === "string" ? req.body.eventId.trim() : "";

    if (!ticketId || !orderId || !eventId) {
      return deny(res, 400, "ticketId, orderId, and eventId are required");
    }

    const organizerId = String(authUser.user_id);
    const ticket = await findTicketByIds(ticketId, orderId, eventId);

    if (!ticket) {
      return deny(res, 404, "Ticket not found");
    }

    if (String(ticket.organizer_id) !== organizerId) {
      return deny(
        res,
        403,
        "You do not have access to confirm payments for this event",
        ticket
      );
    }

    if (ticket.order_status === "cancelled") {
      return deny(res, 400, "Order has been cancelled", ticket);
    }

    if (ticket.order_status === "expired") {
      return deny(res, 400, "Order has already expired", ticket);
    }

    if (ticket.ticket_status === "cancelled") {
      return deny(res, 400, "Ticket has been cancelled", ticket);
    }

    if (ticket.ticket_status === "used" || ticket.checked_in_at) {
      return deny(res, 409, "Ticket already used", ticket);
    }

    if (ticket.payment_method !== "cash") {
      return deny(res, 400, "Only cash tickets can be confirmed here", ticket);
    }

    const orderUpdate = await mysqlQuery<ResultSetHeader>(
      `
      UPDATE ticket_orders
      SET
        payment_status = 'paid',
        order_status = 'confirmed',
        paid_at = NOW(),
        scanned_at = NOW(),
        scanned_by = ?,
        paid_amount_php = CASE
          WHEN paid_amount_php < total_amount_php THEN total_amount_php
          ELSE paid_amount_php
        END,
        remaining_amount_php = 0
      WHERE id = ?
        AND event_id = ?
        AND payment_method = 'cash'
        AND order_status NOT IN ('cancelled', 'expired')
      `,
      [organizerId, ticket.order_id, ticket.event_id]
    );

    if (Number(orderUpdate?.affectedRows ?? 0) === 0) {
      return deny(res, 409, "Cash payment could not be confirmed", ticket);
    }

    const ticketUpdate = await mysqlQuery<ResultSetHeader>(
      `
      UPDATE tickets
      SET
        status = 'used',
        checked_in_at = NOW()
      WHERE id = ?
        AND event_id = ?
        AND status = 'active'
        AND checked_in_at IS NULL
      `,
      [ticket.ticket_id, ticket.event_id]
    );

    if (Number(ticketUpdate?.affectedRows ?? 0) === 0) {
      return deny(res, 409, "Ticket already used or no longer active", ticket);
    }

    const refreshed = await findTicketByIds(ticketId, orderId, eventId);

    if (!refreshed) {
      return deny(res, 500, "Cash payment confirmed but ticket reload failed");
    }

    return res.status(200).json({
      valid: true,
      action: "ALLOW_ENTRY" as ScanAction,
      message: "Cash payment confirmed. Entry allowed.",
      ticket: buildTicketPayload(refreshed),
    });
  } catch (error) {
    console.error("confirmCashTicketPaymentAndEntry error:", error);

    return deny(res, 500, "Failed to confirm cash payment");
  }
}