import { Request, Response } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { mysqlQuery } from "../utils/mysqlQuery";
import { computeTicketPricing } from "../utils/pricing";
import { applyPromoToSubtotal } from "../services/promo.code";
import mysqlDB from "../databes/config/Mysqldb";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

type AuthenticatedUser = {
  id: number | string;
  user_id: number | string;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || "";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

const createTicketOrderSchema = z.object({
  eventId: z.string().trim().min(1, "Event ID is required"),
  tierId: z.string().trim().min(1, "Tier ID is required"),
  qty: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1")
    .max(20, "Maximum 20 tickets per order"),
  buyerName: z
    .string()
    .trim()
    .min(1, "Buyer name is required")
    .max(100, "Buyer name must not exceed 100 characters"),
  buyerEmail: z
    .string()
    .trim()
    .min(1, "Buyer email is required")
    .email("Valid buyer email is required"),
  paymentMethod: z.enum(["gcash", "card", "cash"]).default("gcash"),
  promoCode: z.string().trim().min(3).max(50).optional(),
});

interface TierRow extends RowDataPacket {
  id: string;
  event_id: string;
  name: string;
  price_php: number;
  capacity: number;
  sold: number;
  reserved?: number;
  event_title: string;
  event_status: string;
  event_location: string | null;
  event_date: string | null;
  event_time: string | null;
  event_image: string | null;
}

interface TicketOrderPaymentRow extends RowDataPacket {
  id: string;
  order_id: string;
  payment_kind: "downpayment" | "final" | "full";
  amount_php: number;
  payment_method: "gcash" | "card" | "cash";
  paymongo_checkout_session_id: string | null;
  paymongo_payment_intent_id: string | null;
  paymongo_payment_id: string | null;
  payment_status: "pending" | "paid" | "failed" | "expired" | "refunded";
  paid_at: string | null;
  created_at: string;
  updated_at: string;
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
  subtotal_php: number;
  discount_amount_php: number;
  promo_code_id: string | null;
  promo_code: string | null;
  service_fee_php: number;
  total_amount_php: number;
  payment_method: "gcash" | "card" | "cash";
  payment_status: "pending" | "partial" | "paid" | "failed" | "refunded";
  order_status: "pending" | "confirmed" | "cancelled" | "expired";
  checkout_session_id: string | null;
  checkout_url: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  created_at: string;

  order_mode: "direct" | "reservation";
  reservation_status:
    | "none"
    | "reserved"
    | "completed"
    | "expired"
    | "forfeited";
  reservation_expires_at: string | null;
  reserved_qty: number;
  downpayment_percent: string | number;
  downpayment_amount_php: number;
  remaining_amount_php: number;
  paid_amount_php: number;
  final_payment_due_at: string | null;
  inventory_released_at: string | null;

  event_title: string;
  event_status?: string;
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

const reserveTicketOrderSchema = z.object({
  eventId: z.string().trim().min(1, "Event ID is required"),
  tierId: z.string().trim().min(1, "Tier ID is required"),
  qty: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1")
    .max(20, "Maximum 20 tickets per order"),
  buyerName: z
    .string()
    .trim()
    .min(1, "Buyer name is required")
    .max(100, "Buyer name must not exceed 100 characters"),
  buyerEmail: z
    .string()
    .trim()
    .min(1, "Buyer email is required")
    .email("Valid buyer email is required"),
  paymentMethod: z.enum(["gcash", "card", "cash"]).default("gcash"),
});

export async function reserveTicketOrder(req: Request, res: Response) {
  let connection: any = null;

  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({
        message: "Only customers can reserve tickets",
      });
    }

    const parsed = reserveTicketOrderSchema.safeParse({
      ...req.body,
      qty: Number(req.body?.qty),
    });

    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const { eventId, tierId, qty, buyerName, buyerEmail, paymentMethod } =
      parsed.data;
    const buyerId = String(authUser.user_id);

    connection = await mysqlDB.getConnection();
    await connection.beginTransaction();

    const [tierRows] = await connection.query(
      `
      SELECT
        ett.id,
        ett.event_id,
        ett.name,
        ett.price_php,
        ett.capacity,
        ett.sold,
        ett.reserved,
        e.title AS event_title,
        e.status AS event_status,
        e.location AS event_location,
        e.event_date,
        e.time_text AS event_time,
        e.poster_url AS event_image
      FROM event_ticket_tiers ett
      INNER JOIN events e ON e.id = ett.event_id
      WHERE ett.id = ? AND ett.event_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [tierId, eventId],
    );

    const tiers = tierRows as TierRow[];

    if (!tiers.length) {
      await connection.rollback();
      return res.status(404).json({
        message: "Ticket tier not found for this event",
      });
    }

    const tier = tiers[0];

    if (tier.event_status !== "published") {
      await connection.rollback();
      return res.status(400).json({
        message: "Tickets can only be reserved for published events",
      });
    }

    const available =
      Number(tier.capacity) - Number(tier.sold) - Number(tier.reserved ?? 0);

    if (available <= 0) {
      await connection.rollback();
      return res.status(400).json({
        message: "This ticket tier is sold out",
      });
    }

    if (qty > available) {
      await connection.rollback();
      return res.status(400).json({
        message: `Only ${available} ticket(s) left for this tier`,
      });
    }

    const pricing = computeReservationPricing({
      unitPricePhp: Number(tier.price_php),
      quantity: qty,
    });

    const orderId = uuidv4();
    const receiptNo = generateReceiptNo();
    const now = new Date();
    const expiresAt = addHours(now, RESERVATION_WINDOW_HOURS);

    await connection.query(
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
        subtotal_php,
        discount_amount_php,
        promo_code_id,
        promo_code,
        service_fee_php,
        total_amount_php,
        payment_method,
        payment_status,
        order_status,
        payment_provider,
        order_mode,
        reservation_status,
        reservation_expires_at,
        reserved_qty,
        downpayment_percent,
        downpayment_amount_php,
        remaining_amount_php,
        paid_amount_php,
        final_payment_due_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        pricing.subtotalPhp,
        0,
        null,
        null,
        pricing.serviceFeePhp,
        pricing.totalAmountPhp,
        paymentMethod,
        "pending",
        "pending",
        "paymongo",
        "reservation",
        "reserved",
        expiresAt,
        qty,
        pricing.downpaymentPercent,
        pricing.downpaymentAmountPhp,
        pricing.remainingAmountPhp,
        0,
        expiresAt,
      ],
    );

    await connection.query(
      `
      UPDATE event_ticket_tiers
      SET reserved = reserved + ?
      WHERE id = ?
      `,
      [qty, tierId],
    );

    const paymentId = uuidv4();

    await connection.query(
      `
      INSERT INTO ticket_order_payments (
        id,
        order_id,
        payment_kind,
        amount_php,
        payment_method,
        payment_status
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        paymentId,
        orderId,
        "downpayment",
        pricing.downpaymentAmountPhp,
        paymentMethod,
        "pending",
      ],
    );

    await connection.commit();

    try {
      const checkout = await createPaymongoCheckoutSession({
        orderId,
        receiptNo,
        eventTitle: tier.event_title,
        tierName: tier.name,
        qty,
        amountPhp: pricing.downpaymentAmountPhp,
        buyerName,
        buyerEmail,
        paymentKind: "downpayment",
        description: `Reservation downpayment for ${receiptNo}`,
      });

      await mysqlQuery<ResultSetHeader>(
        `
        UPDATE ticket_orders
        SET
          checkout_session_id = ?,
          checkout_url = ?
        WHERE id = ?
        `,
        [checkout.checkoutSessionId, checkout.checkoutUrl, orderId],
      );

      await mysqlQuery<ResultSetHeader>(
        `
        UPDATE ticket_order_payments
        SET paymongo_checkout_session_id = ?
        WHERE id = ?
        `,
        [checkout.checkoutSessionId, paymentId],
      );

      return res.status(201).json({
        message: "Ticket reservation created successfully",
        checkoutUrl: checkout.checkoutUrl,
        order: {
          id: orderId,
          receiptNo,
          eventId,
          eventTitle: tier.event_title,
          eventLocation: tier.event_location,
          eventDate: tier.event_date,
          eventTime: tier.event_time,
          eventImage: tier.event_image,
          tierId,
          tierName: tier.name,
          qty,
          unitPricePhp: Number(tier.price_php),
          subtotalPhp: pricing.subtotalPhp,
          serviceFeePhp: pricing.serviceFeePhp,
          totalAmountPhp: pricing.totalAmountPhp,
          downpaymentPercent: pricing.downpaymentPercent,
          downpaymentAmountPhp: pricing.downpaymentAmountPhp,
          remainingAmountPhp: pricing.remainingAmountPhp,
          buyerName,
          buyerEmail,
          paymentMethod,
          orderMode: "reservation",
          reservationStatus: "reserved",
          reservationExpiresAt: expiresAt,
          paymentStatus: "pending",
          orderStatus: "pending",
        },
      });
    } catch (checkoutError: any) {
      console.error("reserveTicketOrder checkout error:", checkoutError);

      connection = await mysqlDB.getConnection();
      await connection.beginTransaction();

      await connection.query(
        `
        UPDATE event_ticket_tiers
        SET reserved = GREATEST(reserved - ?, 0)
        WHERE id = ?
        `,
        [qty, tierId],
      );

      await connection.query(
        `
        DELETE FROM ticket_order_payments
        WHERE id = ?
        `,
        [paymentId],
      );

      await connection.query(
        `
        DELETE FROM ticket_orders
        WHERE id = ?
        `,
        [orderId],
      );

      await connection.commit();

      return res.status(500).json({
        message:
          checkoutError?.message ||
          "Failed to create reservation payment session",
      });
    }
  } catch (error: any) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }

    console.error("reserveTicketOrder error:", error);
    return res.status(500).json({
      message: error?.message || "Failed to reserve ticket",
    });
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch {}
    }
  }
}

const RESERVATION_WINDOW_HOURS = 10;
const RESERVATION_DOWNPAYMENT_PERCENT = 10;

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function isExpired(dateString: string | null | undefined) {
  if (!dateString) return true;
  return new Date(dateString).getTime() <= Date.now();
}

function computeReservationPricing(params: {
  unitPricePhp: number;
  quantity: number;
}) {
  const basePricing = computeTicketPricing({
    unitPricePhp: params.unitPricePhp,
    quantity: params.quantity,
  });

  const subtotalPhp = Number(basePricing.subtotalPhp);
  const serviceFeePhp = Number(basePricing.serviceFeePhp);
  const totalAmountPhp = Number(subtotalPhp + serviceFeePhp);

  const downpaymentAmountPhp = Math.ceil(
    subtotalPhp * (RESERVATION_DOWNPAYMENT_PERCENT / 100),
  );

  const remainingAmountPhp = Math.max(totalAmountPhp - downpaymentAmountPhp, 0);

  return {
    subtotalPhp,
    serviceFeePhp,
    totalAmountPhp,
    downpaymentPercent: RESERVATION_DOWNPAYMENT_PERCENT,
    downpaymentAmountPhp,
    remainingAmountPhp,
  };
}

export async function payReservationBalance(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({
        message: "Only customers can continue reservation payment",
      });
    }

    const { orderId } = req.params;
    const buyerId = String(authUser.user_id);

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

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
        o.subtotal_php,
        o.discount_amount_php,
        o.promo_code_id,
        o.promo_code,
        o.service_fee_php,
        o.total_amount_php,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.checkout_session_id,
        o.checkout_url,
        o.payment_reference,
        o.paid_at,
        o.created_at,
        o.order_mode,
        o.reservation_status,
        o.reservation_expires_at,
        o.reserved_qty,
        o.downpayment_percent,
        o.downpayment_amount_php,
        o.remaining_amount_php,
        o.paid_amount_php,
        o.final_payment_due_at,
        o.inventory_released_at,
        e.title AS event_title,
        e.status AS event_status,
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
      [orderId, buyerId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Reservation order not found" });
    }

    const order = rows[0];

    if (order.order_mode !== "reservation") {
      return res.status(400).json({
        message: "This order is not a reservation order",
      });
    }

    if (order.payment_status === "paid") {
      return res.status(400).json({
        message: "This reservation is already fully paid",
      });
    }

    if (
      order.order_status === "cancelled" ||
      order.order_status === "expired"
    ) {
      return res.status(400).json({
        message: "This reservation can no longer be paid",
      });
    }

    if (
      order.reservation_status !== "reserved" ||
      isExpired(order.reservation_expires_at)
    ) {
      return res.status(400).json({
        message: "This reservation has already expired",
      });
    }

    if (Number(order.remaining_amount_php) <= 0) {
      return res.status(400).json({
        message: "No remaining balance found for this reservation",
      });
    }

    const paymentId = uuidv4();

    await mysqlQuery<ResultSetHeader>(
      `
      INSERT INTO ticket_order_payments (
        id,
        order_id,
        payment_kind,
        amount_php,
        payment_method,
        payment_status
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        paymentId,
        order.id,
        "final",
        Number(order.remaining_amount_php),
        order.payment_method,
        "pending",
      ],
    );

    const checkout = await createPaymongoCheckoutSession({
      orderId: order.id,
      receiptNo: order.receipt_no,
      eventTitle: order.event_title,
      tierName: order.tier_name,
      qty: Number(order.qty),
      amountPhp: Number(order.remaining_amount_php),
      buyerName: order.buyer_name,
      buyerEmail: order.buyer_email,
      paymentKind: "final",
      description: `Final reservation payment for ${order.receipt_no}`,
    });

    await mysqlQuery<ResultSetHeader>(
      `
      UPDATE ticket_orders
      SET
        checkout_session_id = ?,
        checkout_url = ?
      WHERE id = ?
      `,
      [checkout.checkoutSessionId, checkout.checkoutUrl, order.id],
    );

    await mysqlQuery<ResultSetHeader>(
      `
      UPDATE ticket_order_payments
      SET paymongo_checkout_session_id = ?
      WHERE id = ?
      `,
      [checkout.checkoutSessionId, paymentId],
    );

    return res.status(200).json({
      message: "Reservation balance checkout created",
      checkoutUrl: checkout.checkoutUrl,
      orderId: order.id,
      reservationStatus: order.reservation_status,
      paymentStatus: order.payment_status,
      remainingAmountPhp: Number(order.remaining_amount_php),
      reservationExpiresAt: order.reservation_expires_at,
    });
  } catch (error: any) {
    console.error("payReservationBalance error:", error);
    return res.status(500).json({
      message: error?.message || "Failed to continue reservation payment",
    });
  }
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

async function buildQrDataUrl(ticket: { qrToken: string }) {
  const payload = `IMAJIN_TICKET:${ticket.qrToken}`;

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "L",
    margin: 1,
    width: 360,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

async function createPaymongoCheckoutSession(params: {
  orderId: string;
  receiptNo: string;
  eventTitle: string;
  tierName: string;
  qty: number;
  amountPhp: number;
  buyerName: string;
  buyerEmail: string;
  description?: string;
  paymentKind?: "downpayment" | "final" | "full";
}): Promise<{
  checkoutSessionId: string;
  checkoutUrl: string;
}> {
  if (!PAYMONGO_SECRET_KEY) {
    throw new Error("PAYMONGO_SECRET_KEY is missing");
  }

  const auth = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64");

  const paymentKind = params.paymentKind || "full";
  const description =
    params.description || `Ticket order ${params.receiptNo} (${paymentKind})`;

  const body = {
    data: {
      attributes: {
        billing: {
          name: params.buyerName,
          email: params.buyerEmail,
        },
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        line_items: [
          {
            currency: "PHP",
            amount: Math.round(Number(params.amountPhp) * 100),
            description: `${params.eventTitle} - ${params.tierName}`,
            name: `${params.eventTitle} - ${params.tierName} (${paymentKind})`,
            quantity: 1,
          },
        ],
        payment_method_types: ["gcash"],
        success_url: `${APP_URL}/dashboard/customer?tab=tickets&payment=success&orderId=${params.orderId}`,
        cancel_url: `${APP_URL}/dashboard/customer?tab=tickets&payment=cancelled&orderId=${params.orderId}`,
        description,
        metadata: {
          orderId: params.orderId,
          receiptNo: params.receiptNo,
          qty: params.qty,
          paymentKind,
        },
      },
    },
  };

  const response = await fetch(
    "https://api.paymongo.com/v1/checkout_sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      json?.errors?.[0]?.detail || "Failed to create PayMongo checkout session",
    );
  }

  const checkoutSessionId = json?.data?.id as string | undefined;
  const checkoutUrl = json?.data?.attributes?.checkout_url as
    | string
    | undefined;

  if (!checkoutSessionId || !checkoutUrl) {
    throw new Error("PayMongo checkout session response is incomplete");
  }

  return {
    checkoutSessionId,
    checkoutUrl,
  };
}

export async function createTicketOrder(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res
        .status(403)
        .json({ message: "Only customers can buy tickets" });
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
      buyerName,
      buyerEmail,
      promoCode,
    } = parsed.data;

    const tierRows = await mysqlQuery<TierRow[]>(
      `
      SELECT
        ett.id,
        ett.event_id,
        ett.name,
        ett.price_php,
        ett.capacity,
        ett.sold,
        ett.reserved,
        e.title AS event_title,
        e.status AS event_status,
        e.location AS event_location,
        e.event_date,
        e.time_text AS event_time,
        e.poster_url AS event_image
      FROM event_ticket_tiers ett
      INNER JOIN events e ON e.id = ett.event_id
      WHERE ett.id = ? AND ett.event_id = ?
      LIMIT 1
      `,
      [tierId, eventId],
    );

    if (!tierRows.length) {
      return res.status(404).json({
        message: "Ticket tier not found for this event",
      });
    }

    const tier = tierRows[0];

    if (tier.event_status !== "published") {
      return res.status(400).json({
        message: "Tickets can only be purchased for published events",
      });
    }

    const available =
      Number(tier.capacity) - Number(tier.sold) - Number(tier.reserved ?? 0);

    if (available <= 0) {
      return res.status(400).json({
        message: "This ticket tier is sold out",
      });
    }

    if (qty > available) {
      return res.status(400).json({
        message: `Only ${available} ticket(s) left for this tier`,
      });
    }

    const basePricing = computeTicketPricing({
      unitPricePhp: Number(tier.price_php),
      quantity: qty,
    });

    let subtotalPhp = Number(basePricing.subtotalPhp);
    let discountAmountPhp = 0;
    let promoCodeId: string | null = null;
    let appliedPromoCode: string | null = null;

    if (promoCode?.trim()) {
      try {
        const promoResult = await applyPromoToSubtotal({
          eventId,
          code: promoCode,
          subtotalPhp,
        });

        discountAmountPhp = Number(promoResult.discountAmountPhp ?? 0);
        subtotalPhp = Number(promoResult.finalSubtotalPhp ?? subtotalPhp);
        promoCodeId = String(promoResult.promo.id);
        appliedPromoCode = String(promoResult.promo.code);
      } catch (promoError: any) {
        return res.status(400).json({
          message: promoError?.message || "Invalid promo code.",
        });
      }
    }

    const serviceFeePhp = Number(basePricing.serviceFeePhp);
    const totalAmountPhp = Math.max(subtotalPhp + serviceFeePhp, 0);

    const orderId = uuidv4();
    const receiptNo = generateReceiptNo();
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
        subtotal_php,
        discount_amount_php,
        promo_code_id,
        promo_code,
        service_fee_php,
        total_amount_php,
        payment_method,
        payment_status,
        order_status,
        payment_provider
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        subtotalPhp,
        discountAmountPhp,
        promoCodeId,
        appliedPromoCode,
        serviceFeePhp,
        totalAmountPhp,
        paymentMethod,
        "pending",
        "pending",
        "paymongo",
      ],
    );

    try {
      const checkout = await createPaymongoCheckoutSession({
        orderId,
        receiptNo,
        eventTitle: tier.event_title,
        tierName: tier.name,
        qty,
        amountPhp: totalAmountPhp,
        buyerName,
        buyerEmail,
        paymentKind: "full",
        description: `Full ticket payment for ${receiptNo}`,
      });

      const paymentId = uuidv4();

      await mysqlQuery(
        `
    INSERT INTO ticket_order_payments (
      id,
      order_id,
      payment_kind,
      amount_php,
      payment_method,
      payment_status
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
        [paymentId, orderId, "full", totalAmountPhp, paymentMethod, "pending"],
      );

      await mysqlQuery<ResultSetHeader>(
        `
  UPDATE ticket_orders
  SET
    checkout_session_id = ?,
    checkout_url = ?
  WHERE id = ?
  `,
        [checkout.checkoutSessionId, checkout.checkoutUrl, orderId],
      );

      await mysqlQuery<ResultSetHeader>(
        `
  UPDATE ticket_order_payments
  SET paymongo_checkout_session_id = ?
  WHERE id = ?
  `,
        [checkout.checkoutSessionId, paymentId],
      );

      return res.status(201).json({
        message: "Ticket order created successfully",
        checkoutUrl: checkout.checkoutUrl,
        order: {
          id: orderId,
          receiptNo,
          eventId,
          eventTitle: tier.event_title,
          eventLocation: tier.event_location,
          eventDate: tier.event_date,
          eventTime: tier.event_time,
          eventImage: tier.event_image,
          tierId,
          tierName: tier.name,
          qty,
          unitPricePhp: Number(tier.price_php),
          subtotalPhp,
          discountAmountPhp,
          promoCode: appliedPromoCode,
          serviceFeePhp,
          totalAmountPhp,
          buyerName,
          buyerEmail,
          paymentMethod,
          paymentStatus: "pending",
          orderStatus: "pending",
        },
        tickets: [],
      });
    } catch (checkoutError: any) {
      console.error("createPaymongoCheckoutSession error:", checkoutError);

      await mysqlQuery<ResultSetHeader>(
        `
        DELETE FROM ticket_orders
        WHERE id = ?
        LIMIT 1
        `,
        [orderId],
      );

      return res.status(500).json({
        message: checkoutError?.message || "Failed to create payment session",
      });
    }
  } catch (error: any) {
    console.error("createTicketOrder error:", error);

    return res.status(500).json({
      message: error?.message || "Failed to create ticket order",
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
      return res.status(403).json({
        message: "Only customers can view ticket orders",
      });
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
        o.subtotal_php,
        o.discount_amount_php,
        o.promo_code_id,
        o.promo_code,
        o.service_fee_php,
        o.total_amount_php,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.checkout_session_id,
        o.checkout_url,
        o.payment_reference,
        o.paid_at,
        o.created_at,
        o.order_mode,
        o.reservation_status,
        o.reservation_expires_at,
        o.reserved_qty,
        o.downpayment_percent,
        o.downpayment_amount_php,
        o.remaining_amount_php,
        o.paid_amount_php,
        o.final_payment_due_at,
        o.inventory_released_at,
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
      [buyerId],
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
        unitPricePhp: Number(row.price_php),
        subtotalPhp: Number(row.subtotal_php ?? 0),
        discountAmountPhp: Number(row.discount_amount_php ?? 0),
        promoCode: row.promo_code ?? null,
        serviceFeePhp: Number(row.service_fee_php ?? 0),
        totalAmountPhp: Number(row.total_amount_php ?? 0),

        orderMode: row.order_mode,
        reservationStatus: row.reservation_status,
        reservationExpiresAt: row.reservation_expires_at,
        reservedQty: Number(row.reserved_qty ?? 0),
        downpaymentPercent: Number(row.downpayment_percent ?? 0),
        downpaymentAmountPhp: Number(row.downpayment_amount_php ?? 0),
        remainingAmountPhp: Number(row.remaining_amount_php ?? 0),
        paidAmountPhp: Number(row.paid_amount_php ?? 0),
        finalPaymentDueAt: row.final_payment_due_at,
        inventoryReleasedAt: row.inventory_released_at,

        buyerName: row.buyer_name,
        buyerEmail: row.buyer_email,
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        orderStatus: row.order_status,
        checkoutUrl: row.checkout_url,
        paymentReference: row.payment_reference,
        paidAt: row.paid_at,
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
      return res.status(403).json({
        message: "Only customers can view ticket details",
      });
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
        o.subtotal_php,
        o.discount_amount_php,
        o.promo_code_id,
        o.promo_code,
        o.service_fee_php,
        o.total_amount_php,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.checkout_session_id,
        o.checkout_url,
        o.payment_reference,
        o.paid_at,
        o.created_at,
        o.order_mode,
        o.reservation_status,
        o.reservation_expires_at,
        o.reserved_qty,
        o.downpayment_percent,
        o.downpayment_amount_php,
        o.remaining_amount_php,
        o.paid_amount_php,
        o.final_payment_due_at,
        o.inventory_released_at,
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
      [orderId, buyerId],
    );

    if (!orderRows.length) {
      return res.status(404).json({ message: "Ticket order not found" });
    }

    const order = orderRows[0];

    let tickets: Array<{
      id: string;
      ticketNumber: number;
      orderId: string;
      eventId: string;
      tierId: string;
      status: "active" | "used" | "cancelled";
      checkedInAt: string | null;
      qrToken: string;
      qrCodeDataUrl: string;
    }> = [];

    if (order.payment_status === "paid") {
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
    [orderId],
  );

  tickets = await Promise.all(
    ticketRows.map(async (ticket, index) => {
      const qrCodeDataUrl = await buildQrDataUrl({
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
    }),
  );
}

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
        unitPricePhp: Number(order.price_php),
        subtotalPhp: Number(order.subtotal_php ?? 0),
        discountAmountPhp: Number(order.discount_amount_php ?? 0),
        promoCode: order.promo_code ?? null,
        serviceFeePhp: Number(order.service_fee_php ?? 0),
        totalAmountPhp: Number(order.total_amount_php ?? 0),

        orderMode: order.order_mode,
        reservationStatus: order.reservation_status,
        reservationExpiresAt: order.reservation_expires_at,
        reservedQty: Number(order.reserved_qty ?? 0),
        downpaymentPercent: Number(order.downpayment_percent ?? 0),
        downpaymentAmountPhp: Number(order.downpayment_amount_php ?? 0),
        remainingAmountPhp: Number(order.remaining_amount_php ?? 0),
        paidAmountPhp: Number(order.paid_amount_php ?? 0),
        finalPaymentDueAt: order.final_payment_due_at,
        inventoryReleasedAt: order.inventory_released_at,

        buyerName: order.buyer_name,
        buyerEmail: order.buyer_email,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        checkoutUrl: order.checkout_url,
        paymentReference: order.payment_reference,
        paidAt: order.paid_at,
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

export async function expireReservationOrders(req: Request, res: Response) {
  let connection: any = null;

  try {
    connection = await mysqlDB.getConnection();
    await connection.beginTransaction();

    const [expiredOrderRows] = await connection.query(
      `
      SELECT
        id,
        tier_id,
        qty,
        reserved_qty
      FROM ticket_orders
      WHERE order_mode = 'reservation'
        AND reservation_status = 'reserved'
        AND order_status = 'pending'
        AND reservation_expires_at IS NOT NULL
        AND reservation_expires_at <= NOW()
      FOR UPDATE
      `,
    );

    const expiredOrders = expiredOrderRows as Array<
      RowDataPacket & {
        id: string;
        tier_id: string;
        qty: number;
        reserved_qty: number;
      }
    >;

    if (!expiredOrders.length) {
      await connection.commit();
      return res.status(200).json({
        message: "No expired reservations found",
        expiredCount: 0,
      });
    }

    for (const order of expiredOrders) {
      const releaseQty = Number(order.reserved_qty || order.qty || 0);

      await connection.query(
        `
        UPDATE event_ticket_tiers
        SET reserved = GREATEST(reserved - ?, 0)
        WHERE id = ?
        `,
        [releaseQty, order.tier_id],
      );

      await connection.query(
        `
        UPDATE ticket_orders
        SET
          reservation_status = 'forfeited',
          order_status = 'expired',
          inventory_released_at = NOW()
        WHERE id = ?
        `,
        [order.id],
      );

      await connection.query(
        `
        UPDATE ticket_order_payments
        SET payment_status = 'expired'
        WHERE order_id = ?
          AND payment_status = 'pending'
        `,
        [order.id],
      );
    }

    await connection.commit();

    return res.status(200).json({
      message: "Expired reservations processed successfully",
      expiredCount: expiredOrders.length,
      orderIds: expiredOrders.map((o) => o.id),
    });
  } catch (error: any) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {}
    }

    console.error("expireReservationOrders error:", error);

    return res.status(500).json({
      message: error?.message || "Failed to expire reservations",
    });
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch {}
    }
  }
}

export async function continueTicketOrderPayment(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (authUser.role !== "customer") {
      return res.status(403).json({
        message: "Only customers can continue ticket payment",
      });
    }

    const { orderId } = req.params;
    const buyerId = String(authUser.user_id);

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

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
        o.subtotal_php,
        o.discount_amount_php,
        o.promo_code_id,
        o.promo_code,
        o.service_fee_php,
        o.total_amount_php,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.checkout_session_id,
        o.checkout_url,
        o.payment_reference,
        o.paid_at,
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
      [orderId, buyerId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Ticket order not found" });
    }

    const order = rows[0];

    if (order.payment_status === "paid") {
      return res.status(400).json({
        message: "This order is already paid",
      });
    }

    if (order.order_status === "cancelled") {
      return res.status(400).json({
        message: "This order has already been cancelled",
      });
    }

    if (order.payment_status === "failed") {
      return res.status(400).json({
        message: "This order can no longer be paid",
      });
    }

    const checkout = await createPaymongoCheckoutSession({
      orderId: order.id,
      receiptNo: order.receipt_no,
      eventTitle: order.event_title,
      tierName: order.tier_name,
      qty: Number(order.qty),
      amountPhp: Number(order.total_amount_php),
      buyerName: order.buyer_name,
      buyerEmail: order.buyer_email,
    });

    await mysqlQuery<ResultSetHeader>(
      `
      UPDATE ticket_orders
      SET
        checkout_session_id = ?,
        checkout_url = ?
      WHERE id = ?
      `,
      [checkout.checkoutSessionId, checkout.checkoutUrl, order.id],
    );

    return res.status(200).json({
      message: "New checkout session created",
      checkoutUrl: checkout.checkoutUrl,
      orderId: order.id,
      paymentStatus: order.payment_status,
      orderStatus: order.order_status,
    });
  } catch (error) {
    console.error("continueTicketOrderPayment error:", error);
    return res.status(500).json({
      message: "Failed to continue ticket payment",
    });
  }
}

export async function paymongoWebhook(req: Request, res: Response) {
  console.log("PAYMONGO WEBHOOK HIT");
  console.log("Webhook body:", JSON.stringify(req.body, null, 2));

  let connection: any = null;

  try {
    const eventType = req.body?.data?.attributes?.type;
    const eventData = req.body?.data?.attributes?.data;

    if (!eventType) {
      return res.status(400).json({ message: "Missing webhook event type" });
    }

    if (
      eventType !== "checkout_session.payment.paid" &&
      eventType !== "payment.paid"
    ) {
      return res.status(200).json({ received: true, ignored: true });
    }

    let orderId: string | null = null;
    let paymentReference: string | null = null;
    let checkoutSessionId: string | null = null;
    let paymongoPaymentId: string | null = null;
    let paymongoPaymentIntentId: string | null = null;
    let paymentKindFromMetadata: "downpayment" | "final" | "full" | null = null;

    if (eventType === "checkout_session.payment.paid") {
      orderId =
        eventData?.attributes?.metadata?.orderId ||
        eventData?.attributes?.payments?.[0]?.attributes?.metadata?.orderId ||
        eventData?.attributes?.payments?.[0]?.attributes?.source?.metadata
          ?.orderId ||
        null;

      paymentReference =
        eventData?.attributes?.payments?.[0]?.id || eventData?.id || null;

      checkoutSessionId = eventData?.id || null;

      paymongoPaymentId = eventData?.attributes?.payments?.[0]?.id || null;

      paymongoPaymentIntentId =
        eventData?.attributes?.payments?.[0]?.attributes?.payment_intent_id ||
        eventData?.attributes?.payments?.[0]?.attributes?.payment_intent?.id ||
        null;

      paymentKindFromMetadata =
        eventData?.attributes?.metadata?.paymentKind ||
        eventData?.attributes?.payments?.[0]?.attributes?.metadata
          ?.paymentKind ||
        eventData?.attributes?.payments?.[0]?.attributes?.source?.metadata
          ?.paymentKind ||
        null;
    } else if (eventType === "payment.paid") {
      orderId =
        eventData?.attributes?.metadata?.orderId ||
        eventData?.attributes?.source?.metadata?.orderId ||
        eventData?.attributes?.payment_intent?.attributes?.metadata?.orderId ||
        null;

      paymentReference = eventData?.id || null;
      paymongoPaymentId = eventData?.id || null;

      checkoutSessionId =
        eventData?.attributes?.checkout_session_id ||
        eventData?.attributes?.checkout_session?.id ||
        null;

      paymongoPaymentIntentId =
        eventData?.attributes?.payment_intent_id ||
        eventData?.attributes?.payment_intent?.id ||
        null;

      paymentKindFromMetadata =
        eventData?.attributes?.metadata?.paymentKind ||
        eventData?.attributes?.source?.metadata?.paymentKind ||
        eventData?.attributes?.payment_intent?.attributes?.metadata
          ?.paymentKind ||
        null;
    }

    if (!orderId && checkoutSessionId) {
      const fallbackRows = await mysqlQuery<MyOrderRow[]>(
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
          o.subtotal_php,
          o.discount_amount_php,
          o.promo_code_id,
          o.promo_code,
          o.service_fee_php,
          o.total_amount_php,
          o.payment_method,
          o.payment_status,
          o.order_status,
          o.checkout_session_id,
          o.checkout_url,
          o.payment_reference,
          o.paid_at,
          o.created_at,
          o.order_mode,
          o.reservation_status,
          o.reservation_expires_at,
          o.reserved_qty,
          o.downpayment_percent,
          o.downpayment_amount_php,
          o.remaining_amount_php,
          o.paid_amount_php,
          o.final_payment_due_at,
          o.inventory_released_at,
          e.title AS event_title,
          e.status AS event_status,
          e.location AS event_location,
          e.event_date,
          e.time_text AS event_time,
          e.poster_url AS event_image,
          t.name AS tier_name,
          t.price_php
        FROM ticket_orders o
        INNER JOIN events e ON e.id = o.event_id
        INNER JOIN event_ticket_tiers t ON t.id = o.tier_id
        WHERE o.checkout_session_id = ?
        LIMIT 1
        `,
        [checkoutSessionId],
      );

      if (fallbackRows.length) {
        orderId = fallbackRows[0].id;
      }
    }

    if (!orderId) {
      return res.status(400).json({
        received: false,
        message: "Unable to resolve orderId from webhook payload",
      });
    }

    connection = await mysqlDB.getConnection();
    await connection.beginTransaction();

    const [orderRows] = await connection.query(
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
        o.subtotal_php,
        o.discount_amount_php,
        o.promo_code_id,
        o.promo_code,
        o.service_fee_php,
        o.total_amount_php,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.checkout_session_id,
        o.checkout_url,
        o.payment_reference,
        o.paid_at,
        o.created_at,
        o.order_mode,
        o.reservation_status,
        o.reservation_expires_at,
        o.reserved_qty,
        o.downpayment_percent,
        o.downpayment_amount_php,
        o.remaining_amount_php,
        o.paid_amount_php,
        o.final_payment_due_at,
        o.inventory_released_at,
        e.title AS event_title,
        e.status AS event_status,
        e.location AS event_location,
        e.event_date,
        e.time_text AS event_time,
        e.poster_url AS event_image,
        t.name AS tier_name,
        t.price_php
      FROM ticket_orders o
      INNER JOIN events e ON e.id = o.event_id
      INNER JOIN event_ticket_tiers t ON t.id = o.tier_id
      WHERE o.id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [orderId],
    );

    const orders = orderRows as MyOrderRow[];

    if (!orders.length) {
      await connection.rollback();
      return res.status(404).json({
        received: false,
        message: "Order not found",
      });
    }

    const order = orders[0];

    const [tierRows] = await connection.query(
      `
      SELECT
        id,
        capacity,
        sold,
        reserved,
        price_php
      FROM event_ticket_tiers
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [order.tier_id],
    );

    const latestTierRows = tierRows as Array<
      RowDataPacket & {
        id: string;
        capacity: number;
        sold: number;
        reserved: number;
        price_php: number;
      }
    >;

    if (!latestTierRows.length) {
      await connection.rollback();
      return res.status(404).json({
        received: false,
        message: "Tier not found",
      });
    }

    const latestTier = latestTierRows[0];

    let paymentRow: TicketOrderPaymentRow | null = null;

    if (checkoutSessionId) {
      const [paymentRowsByCheckout] = await connection.query(
        `
        SELECT *
        FROM ticket_order_payments
        WHERE order_id = ?
          AND paymongo_checkout_session_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [order.id, checkoutSessionId],
      );

      const paymentsByCheckout =
        paymentRowsByCheckout as TicketOrderPaymentRow[];
      if (paymentsByCheckout.length) {
        paymentRow = paymentsByCheckout[0];
      }
    }

    if (!paymentRow && paymentKindFromMetadata) {
      const [paymentRowsByKind] = await connection.query(
        `
        SELECT *
        FROM ticket_order_payments
        WHERE order_id = ?
          AND payment_kind = ?
          AND payment_status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [order.id, paymentKindFromMetadata],
      );

      const paymentsByKind = paymentRowsByKind as TicketOrderPaymentRow[];
      if (paymentsByKind.length) {
        paymentRow = paymentsByKind[0];
      }
    }

    if (!paymentRow) {
      const [latestPendingPaymentRows] = await connection.query(
        `
        SELECT *
        FROM ticket_order_payments
        WHERE order_id = ?
          AND payment_status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [order.id],
      );

      const latestPendingPayments =
        latestPendingPaymentRows as TicketOrderPaymentRow[];
      if (latestPendingPayments.length) {
        paymentRow = latestPendingPayments[0];
      }
    }

    if (!paymentRow) {
      if (order.payment_status === "paid") {
        await connection.rollback();
        return res.status(200).json({
          received: true,
          alreadyProcessed: true,
        });
      }

      await connection.rollback();
      return res.status(404).json({
        received: false,
        message: "Payment row not found for webhook",
      });
    }

    if (paymentRow.payment_status === "paid") {
      await connection.rollback();
      return res.status(200).json({
        received: true,
        alreadyProcessed: true,
        paymentAlreadyProcessed: true,
      });
    }

    await connection.query(
      `
      UPDATE ticket_order_payments
      SET
        payment_status = 'paid',
        paid_at = NOW(),
        paymongo_checkout_session_id = COALESCE(?, paymongo_checkout_session_id),
        paymongo_payment_intent_id = COALESCE(?, paymongo_payment_intent_id),
        paymongo_payment_id = COALESCE(?, paymongo_payment_id)
      WHERE id = ?
      `,
      [
        checkoutSessionId,
        paymongoPaymentIntentId,
        paymongoPaymentId || paymentReference,
        paymentRow.id,
      ],
    );

    if (paymentRow.payment_kind === "downpayment") {
      if (order.order_mode !== "reservation") {
        await connection.rollback();
        return res.status(400).json({
          received: false,
          message: "Downpayment received for non-reservation order",
        });
      }

      if (
        order.reservation_status !== "reserved" ||
        order.order_status === "expired" ||
        order.order_status === "cancelled"
      ) {
        await connection.rollback();
        return res.status(200).json({
          received: true,
          ignored: true,
          message: "Reservation is no longer active",
        });
      }

      await connection.query(
        `
        UPDATE ticket_orders
        SET
          payment_status = 'partial',
          payment_reference = ?,
          paid_at = COALESCE(paid_at, NOW()),
          paid_amount_php = GREATEST(paid_amount_php, downpayment_amount_php)
        WHERE id = ?
        `,
        [paymentReference, order.id],
      );

      await connection.commit();

      return res.status(200).json({
        received: true,
        processed: true,
        paymentKind: "downpayment",
        orderId: order.id,
      });
    }

    if (paymentRow.payment_kind === "final") {
      if (order.order_mode !== "reservation") {
        await connection.rollback();
        return res.status(400).json({
          received: false,
          message:
            "Final reservation payment received for non-reservation order",
        });
      }

      if (
        order.reservation_status !== "reserved" ||
        isExpired(order.reservation_expires_at)
      ) {
        await connection.rollback();
        return res.status(200).json({
          received: true,
          ignored: true,
          message: "Reservation has already expired",
        });
      }

      if (
        Number(latestTier.reserved) < Number(order.reserved_qty || order.qty)
      ) {
        await connection.rollback();
        return res.status(409).json({
          received: false,
          message: "Reserved inventory is no longer available",
        });
      }

      await connection.query(
        `
        UPDATE event_ticket_tiers
        SET
          reserved = GREATEST(reserved - ?, 0),
          sold = sold + ?
        WHERE id = ?
        `,
        [
          Number(order.reserved_qty || order.qty),
          Number(order.qty),
          order.tier_id,
        ],
      );

      await connection.query(
        `
        UPDATE ticket_orders
        SET
          payment_status = 'paid',
          order_status = 'confirmed',
          reservation_status = 'completed',
          payment_reference = ?,
          paid_at = NOW(),
          paid_amount_php = total_amount_php,
          remaining_amount_php = 0
        WHERE id = ?
        `,
        [paymentReference, order.id],
      );

      for (let i = 0; i < Number(order.qty); i++) {
        const ticketId = uuidv4();
        const qrToken = generateQrToken();

        await connection.query(
          `
          INSERT INTO tickets (
            id,
            order_id,
            event_id,
            tier_id,
            buyer_id,
            qr_token,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, 'active')
          `,
          [
            ticketId,
            order.id,
            order.event_id,
            order.tier_id,
            order.buyer_id,
            qrToken,
          ],
        );
      }

      await connection.commit();

      return res.status(200).json({
        received: true,
        processed: true,
        paymentKind: "final",
        orderId: order.id,
      });
    }

    if (paymentRow.payment_kind === "full") {
      if (order.payment_status === "paid") {
        await connection.rollback();
        return res.status(200).json({
          received: true,
          alreadyProcessed: true,
        });
      }

      const available =
        Number(latestTier.capacity) -
        Number(latestTier.sold) -
        Number(latestTier.reserved ?? 0);

      if (available < Number(order.qty)) {
        await connection.query(
          `
          UPDATE ticket_orders
          SET
            payment_status = 'failed',
            order_status = 'cancelled'
          WHERE id = ?
          `,
          [order.id],
        );

        await connection.commit();

        return res.status(409).json({
          received: false,
          message: "Not enough remaining ticket stock",
        });
      }

      await connection.query(
        `
        UPDATE event_ticket_tiers
        SET sold = sold + ?
        WHERE id = ?
        `,
        [Number(order.qty), order.tier_id],
      );

      await connection.query(
        `
        UPDATE ticket_orders
        SET
          payment_status = 'paid',
          order_status = 'confirmed',
          payment_reference = ?,
          paid_at = NOW(),
          paid_amount_php = total_amount_php
        WHERE id = ?
        `,
        [paymentReference, order.id],
      );

      for (let i = 0; i < Number(order.qty); i++) {
        const ticketId = uuidv4();
        const qrToken = generateQrToken();

        await connection.query(
          `
          INSERT INTO tickets (
            id,
            order_id,
            event_id,
            tier_id,
            buyer_id,
            qr_token,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, 'active')
          `,
          [
            ticketId,
            order.id,
            order.event_id,
            order.tier_id,
            order.buyer_id,
            qrToken,
          ],
        );
      }

      if (order.promo_code_id) {
        await connection.query(
          `
          UPDATE event_promo_codes
          SET used_count = used_count + 1
          WHERE id = ?
            AND (max_uses IS NULL OR used_count < max_uses)
          `,
          [String(order.promo_code_id)],
        );
      }

      await connection.commit();

      return res.status(200).json({
        received: true,
        processed: true,
        paymentKind: "full",
        orderId: order.id,
      });
    }

    await connection.rollback();

    return res.status(400).json({
      received: false,
      message: "Unsupported payment kind",
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("paymongoWebhook rollback error:", rollbackError);
      }
    }

    console.error("paymongoWebhook error:", error);
    return res.status(500).json({
      received: false,
      message: "Webhook processing failed",
    });
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (releaseError) {
        console.error("paymongoWebhook release error:", releaseError);
      }
    }
  }
}
