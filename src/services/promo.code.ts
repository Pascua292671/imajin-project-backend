import { randomUUID } from "crypto";
import { mysqlQuery } from "../utils/mysqlQuery";

export type PromoCodeRow = {
  id: string;
  event_id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
  created_by: number;
  created_at: string;
  updated_at: string;
};

export type AppliedPromoResult = {
  promo: PromoCodeRow;
  discountAmountPhp: number;
  finalSubtotalPhp: number;
};

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export async function createPromoCode(params: {
  eventId: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  maxUses?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  createdBy: number;
}) {
  const id = randomUUID();
  const normalizedCode = normalizeCode(params.code);

  await mysqlQuery(
    `
      INSERT INTO event_promo_codes (
        id,
        event_id,
        code,
        discount_type,
        discount_value,
        max_uses,
        used_count,
        starts_at,
        ends_at,
        is_active,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?)
    `,
    [
      id,
      params.eventId,
      normalizedCode,
      params.discountType,
      params.discountValue,
      params.maxUses ?? null,
      params.startsAt ?? null,
      params.endsAt ?? null,
      params.createdBy,
    ]
  );

  const rows = await mysqlQuery<PromoCodeRow[]>(
    `SELECT * FROM event_promo_codes WHERE id = ? LIMIT 1`,
    [id]
  );

  return rows[0];
}

export async function getPromoCodesByEvent(eventId: string) {
  return mysqlQuery<PromoCodeRow[]>(
    `
      SELECT *
      FROM event_promo_codes
      WHERE event_id = ?
      ORDER BY created_at DESC
    `,
    [eventId]
  );
}

export async function getPromoCodeById(id: string) {
  const rows = await mysqlQuery<PromoCodeRow[]>(
    `SELECT * FROM event_promo_codes WHERE id = ? LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

export async function getValidPromoCodeForCheckout(params: {
  eventId: string;
  code: string;
}) {
  const normalizedCode = normalizeCode(params.code);

  const rows = await mysqlQuery<PromoCodeRow[]>(
    `
      SELECT *
      FROM event_promo_codes
      WHERE event_id = ?
        AND code = ?
        AND is_active = 1
      LIMIT 1
    `,
    [params.eventId, normalizedCode]
  );

  const promo = rows[0];
  if (!promo) return null;

  const now = new Date();

  if (promo.starts_at && new Date(promo.starts_at) > now) {
    throw new Error("Promo code is not active yet.");
  }

  if (promo.ends_at && new Date(promo.ends_at) < now) {
    throw new Error("Promo code has already expired.");
  }

  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    throw new Error("Promo code usage limit has been reached.");
  }

  return promo;
}

export async function applyPromoToSubtotal(params: {
  eventId: string;
  code: string;
  subtotalPhp: number;
}) : Promise<AppliedPromoResult> {
  const promo = await getValidPromoCodeForCheckout({
    eventId: params.eventId,
    code: params.code,
  });

  if (!promo) {
    throw new Error("Invalid promo code.");
  }

  let discountAmountPhp = 0;

  if (promo.discount_type === "percent") {
    discountAmountPhp = Math.round(
      (params.subtotalPhp * Number(promo.discount_value)) / 100
    );
  } else {
    discountAmountPhp = Math.round(Number(promo.discount_value));
  }

  if (discountAmountPhp < 0) discountAmountPhp = 0;
  if (discountAmountPhp > params.subtotalPhp) {
    discountAmountPhp = params.subtotalPhp;
  }

  const finalSubtotalPhp = Math.max(params.subtotalPhp - discountAmountPhp, 0);

  return {
    promo,
    discountAmountPhp,
    finalSubtotalPhp,
  };
}
export async function incrementPromoUsage(promoId: string) {
  await mysqlQuery(
    `
      UPDATE event_promo_codes
      SET used_count = used_count + 1
      WHERE id = ?
        AND (max_uses IS NULL OR used_count < max_uses)
    `,
    [promoId]
  );
}

export async function setPromoCodeActiveState(params: {
  promoId: string;
  isActive: boolean;
}) {
  await mysqlQuery(
    `
      UPDATE event_promo_codes
      SET is_active = ?
      WHERE id = ?
    `,
    [params.isActive ? 1 : 0, params.promoId]
  );

  return getPromoCodeById(params.promoId);
}