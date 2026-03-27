import { Request, Response } from "express";
import { RowDataPacket } from "mysql2/promise";
import { mysqlQuery } from "../utils/mysqlQuery";

interface TierRow extends RowDataPacket {
  id: string;
  event_id: string;
  name: string;
  price_php: number;
  capacity: number;
  sold: number;
}

export async function getEventTicketTiers(req: Request, res: Response) {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        message: "Event ID is required",
      });
    }

    const rows = await mysqlQuery<TierRow[]>(
      `
      SELECT
        id,
        event_id,
        name,
        price_php,
        capacity,
        sold
      FROM event_ticket_tiers
      WHERE event_id = ?
      ORDER BY price_php ASC
      `,
      [eventId]
    );

    return res.status(200).json({
      tiers: rows.map((tier: TierRow) => ({
        ...tier,
        available: Math.max(0, Number(tier.capacity) - Number(tier.sold)),
      })),
    });
  } catch (error) {
    console.error("getEventTicketTiers error:", error);
    return res.status(500).json({
      message: "Failed to load ticket tiers",
    });
  }
}