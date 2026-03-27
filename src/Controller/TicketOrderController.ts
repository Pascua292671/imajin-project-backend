import { Request, Response } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { RowDataPacket } from "mysql2/promise";
import { mysqlQuery } from "../utils/mysqlQuery";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

type AuthenticatedUser = {
  id: number | string;
  user_id: number | string;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

const createTicketOrderSchema = z.object({
  eventId: z.string().min(1, "Event ID is required"),
  tierId: z.string().min(1, "Tier ID is required"),
  qty: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1")
    .max(20, "Maximum 20 tickets per order"),
  buyerName: z.string().min(1).max(100).optional(),
  buyerEmail: z.string().email("Valid buyer email is required").optional(),
  paymentMethod: z.enum(["gcash", "card", "cash"]).default("gcash"),
});

interface TierRow extends RowDataPacket {
  id: string;
  event_id: string;
  name: string;
  price_php: number;
  capacity: number;
  sold: number;
  event_title: string;
  event_status: string;
}

interface MyOrderRow extends RowDataPacket {
  id: string;
  receipt_no: string;
  event_id: string;
  tier_id: string;
  buyer_id: string | null;
  buyer_name: string;
  buyer_email: string;
  qty: number;
  amount_php: number;
  payment_method: "gcash" | "card" | "cash";
  payment_status: "pending" | "paid" | "failed" | "refunded";
  created_at: string;
  event_title: string;
  event_location: string | null;
  event_date: string | null;
  event_time: string | null;
  event_image: string | null;
  tier_name: string;
  price_php: number;
}

interface TicketRow extends RowDataPacket {
  id: string;
  order_id: string;
  event_id: string;
  tier_id: string;
  buyer_id: string | null;
  qr_token: string;
  status: "active" | "used" | "cancelled";
  checked_in_at: string | null;
  created_at: string;
}

function getAuthUser(req: Request): AuthenticatedUser | null {
  const user = req.user as AuthenticatedUser | undefined;
  if (!user) return null;
  if (user.user_id === undefined || user.user_id === null) return null;
  if (!user.role) return null;
  return user;
}

function generateReceiptNo(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `RCP-${yyyy}${mm}${dd}-${suffix}`;
}

function generateQrToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function buildQrDataUrl(ticket: {
  ticketId: string;
  orderId: string;
  eventId: string;
  tierId: string;
  qrToken: string;
}) {
  const payload = JSON.stringify({
    type: "IMAJIN_TICKET",
    ticketId: ticket.ticketId,
    orderId: ticket.orderId,
    eventId: ticket.eventId,
    tierId: ticket.tierId,
    qrToken: ticket.qrToken,
  });

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}

export async function createTicketOrder(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({ message: "Only customers can buy tickets" });
    }

    const parsed = createTicketOrderSchema.safeParse({
      ...req.body,
      qty: Number(req.body?.qty),
    });

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const {
      eventId,
      tierId,
      qty,
      paymentMethod,
      buyerName: bodyBuyerName,
      buyerEmail: bodyBuyerEmail,
    } = parsed.data;

    const buyerName = String(bodyBuyerName || authUser.username || "").trim();
    const buyerEmail = String(bodyBuyerEmail || authUser.email || "").trim();

    if (!buyerName) {
      return res.status(400).json({ message: "Buyer name is required" });
    }

    if (!buyerEmail) {
      return res.status(400).json({ message: "Buyer email is required" });
    }

    const tierRows = await mysqlQuery<TierRow[]>(
      `
      SELECT
        ett.id,
        ett.event_id,
        ett.name,
        ett.price_php,
        ett.capacity,
        ett.sold,
        e.title AS event_title,
        e.status AS event_status
      FROM event_ticket_tiers ett
      INNER JOIN events e ON e.id = ett.event_id
      WHERE ett.id = ? AND ett.event_id = ?
      LIMIT 1
      `,
      [tierId, eventId]
    );

    if (!tierRows.length) {
      return res
        .status(404)
        .json({ message: "Ticket tier not found for this event" });
    }

    const tier = tierRows[0];

    if (tier.event_status !== "published") {
      return res.status(400).json({
        message: "Tickets can only be purchased for published events",
      });
    }

    const available = Number(tier.capacity) - Number(tier.sold);

    if (available <= 0) {
      return res.status(400).json({ message: "This ticket tier is sold out" });
    }

    if (qty > available) {
      return res.status(400).json({
        message: `Only ${available} ticket(s) left for this tier`,
      });
    }

    const orderId = uuidv4();
    const receiptNo = generateReceiptNo();
    const amountPhp = Number(tier.price_php) * qty;
    const buyerId = String(authUser.user_id);

    await mysqlQuery(
      `
      INSERT INTO ticket_orders (
        id,
        receipt_no,
        event_id,
        tier_id,
        buyer_id,
        buyer_name,
        buyer_email,
        qty,
        amount_php,
        payment_method,
        payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        orderId,
        receiptNo,
        eventId,
        tierId,
        buyerId,
        buyerName,
        buyerEmail,
        qty,
        amountPhp,
        paymentMethod,
        "pending",
      ]
    );

    await mysqlQuery(
      `
      UPDATE event_ticket_tiers
      SET sold = sold + ?
      WHERE id = ?
      `,
      [qty, tierId]
    );

    const generatedTickets: Array<{
      id: string;
      orderId: string;
      eventId: string;
      tierId: string;
      buyerId: string;
      qrToken: string;
    }> = [];

    for (let i = 0; i < qty; i++) {
      const ticket = {
        id: uuidv4(),
        orderId,
        eventId,
        tierId,
        buyerId,
        qrToken: generateQrToken(),
      };

      generatedTickets.push(ticket);

      await mysqlQuery(
        `
        INSERT INTO tickets (
          id,
          order_id,
          event_id,
          tier_id,
          buyer_id,
          qr_token,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          ticket.id,
          ticket.orderId,
          ticket.eventId,
          ticket.tierId,
          ticket.buyerId,
          ticket.qrToken,
          "active",
        ]
      );
    }

    const ticketsWithQr = await Promise.all(
      generatedTickets.map(async (ticket, index) => {
        const qrCodeDataUrl = await buildQrDataUrl({
          ticketId: ticket.id,
          orderId: ticket.orderId,
          eventId: ticket.eventId,
          tierId: ticket.tierId,
          qrToken: ticket.qrToken,
        });

        return {
          id: ticket.id,
          ticketNumber: index + 1,
          orderId: ticket.orderId,
          eventId: ticket.eventId,
          tierId: ticket.tierId,
          status: "active" as const,
          qrToken: ticket.qrToken,
          qrCodeDataUrl,
        };
      })
    );

    return res.status(201).json({
      message: "Ticket order created successfully",
      order: {
        id: orderId,
        receiptNo,
        eventId,
        eventTitle: tier.event_title,
        tierId,
        tierName: tier.name,
        qty,
        pricePhp: Number(tier.price_php),
        amountPhp,
        buyerName,
        buyerEmail,
        paymentMethod,
        paymentStatus: "pending",
      },
      tickets: ticketsWithQr,
    });
  } catch (error) {
    console.error("createTicketOrder error:", error);
    return res.status(500).json({
      message: "Failed to create ticket order",
    });
  }
}

export async function getMyTicketOrders(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view ticket orders" });
    }

    const buyerId = String(authUser.user_id);

    const rows = await mysqlQuery<MyOrderRow[]>(
      `
      SELECT
        o.id,
        o.receipt_no,
        o.event_id,
        o.tier_id,
        o.buyer_id,
        o.buyer_name,
        o.buyer_email,
        o.qty,
        o.amount_php,
        o.payment_method,
        o.payment_status,
        o.created_at,
        e.title AS event_title,
        e.location AS event_location,
        e.event_date,
        e.time_text AS event_time,
        e.poster_url AS event_image,
        t.name AS tier_name,
        t.price_php
      FROM ticket_orders o
      INNER JOIN events e ON e.id = o.event_id
      INNER JOIN event_ticket_tiers t ON t.id = o.tier_id
      WHERE o.buyer_id = ?
      ORDER BY o.created_at DESC
      `,
      [buyerId]
    );

    return res.status(200).json({
      orders: rows.map((row) => ({
        id: row.id,
        receiptNo: row.receipt_no,
        eventId: row.event_id,
        eventTitle: row.event_title,
        eventLocation: row.event_location,
        eventDate: row.event_date,
        eventTime: row.event_time,
        eventImage: row.event_image,
        tierId: row.tier_id,
        tierName: row.tier_name,
        qty: Number(row.qty),
        pricePhp: Number(row.price_php),
        amountPhp: Number(row.amount_php),
        buyerName: row.buyer_name,
        buyerEmail: row.buyer_email,
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("getMyTicketOrders error:", error);
    return res.status(500).json({
      message: "Failed to load your ticket orders",
    });
  }
}

export async function getTicketOrderById(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({ message: "Only customers can view ticket details" });
    }

    const { orderId } = req.params;
    const buyerId = String(authUser.user_id);

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    const orderRows = await mysqlQuery<MyOrderRow[]>(
      `
      SELECT
        o.id,
        o.receipt_no,
        o.event_id,
        o.tier_id,
        o.buyer_id,
        o.buyer_name,
        o.buyer_email,
        o.qty,
        o.amount_php,
        o.payment_method,
        o.payment_status,
        o.created_at,
        e.title AS event_title,
        e.location AS event_location,
        e.event_date,
        e.time_text AS event_time,
        e.poster_url AS event_image,
        t.name AS tier_name,
        t.price_php
      FROM ticket_orders o
      INNER JOIN events e ON e.id = o.event_id
      INNER JOIN event_ticket_tiers t ON t.id = o.tier_id
      WHERE o.id = ? AND o.buyer_id = ?
      LIMIT 1
      `,
      [orderId, buyerId]
    );

    if (!orderRows.length) {
      return res.status(404).json({ message: "Ticket order not found" });
    }

    const order = orderRows[0];

    const ticketRows = await mysqlQuery<TicketRow[]>(
      `
      SELECT
        id,
        order_id,
        event_id,
        tier_id,
        buyer_id,
        qr_token,
        status,
        checked_in_at,
        created_at
      FROM tickets
      WHERE order_id = ?
      ORDER BY created_at ASC
      `,
      [orderId]
    );

    const tickets = await Promise.all(
      ticketRows.map(async (ticket, index) => {
        const qrCodeDataUrl = await buildQrDataUrl({
          ticketId: ticket.id,
          orderId: ticket.order_id,
          eventId: ticket.event_id,
          tierId: ticket.tier_id,
          qrToken: ticket.qr_token,
        });

        return {
          id: ticket.id,
          ticketNumber: index + 1,
          orderId: ticket.order_id,
          eventId: ticket.event_id,
          tierId: ticket.tier_id,
          status: ticket.status,
          checkedInAt: ticket.checked_in_at,
          qrToken: ticket.qr_token,
          qrCodeDataUrl,
        };
      })
    );

    return res.status(200).json({
      order: {
        id: order.id,
        receiptNo: order.receipt_no,
        eventId: order.event_id,
        eventTitle: order.event_title,
        eventLocation: order.event_location,
        eventDate: order.event_date,
        eventTime: order.event_time,
        eventImage: order.event_image,
        tierId: order.tier_id,
        tierName: order.tier_name,
        qty: Number(order.qty),
        pricePhp: Number(order.price_php),
        amountPhp: Number(order.amount_php),
        buyerName: order.buyer_name,
        buyerEmail: order.buyer_email,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        createdAt: order.created_at,
      },
      tickets,
    });
  } catch (error) {
    console.error("getTicketOrderById error:", error);
    return res.status(500).json({
      message: "Failed to load ticket order details",
    });
  }
}