import { Request, Response } from "express";
import { mysqlQuery } from "../utils/mysqlQuery";
import { getCustomerId } from "../utils/authHelpers";

export async function getCustomerDashboard(req: Request, res: Response) {
  try {
    const customerId = getCustomerId(req);

    if (!customerId) {
      return res.status(403).json({ message: "Only customers can access this dashboard." });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        id,
        name,
        username,
        email,
        phone_no,
        address,
        age,
        Birthday
      FROM customer
      WHERE id = ?
      LIMIT 1
      `,
      [customerId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Customer not found." });
    }

    const customer = rows[0];

    return res.json({
      profile: {
        id: customer.id,
        fullName: customer.name,
        username: customer.username,
        email: customer.email,
        phone_no: customer.phone_no,
        address: customer.address,
        age: customer.age,
        birthday: customer.Birthday,
      },
    });
  } catch (error) {
    console.error("getCustomerDashboard error:", error);
    return res.status(500).json({ message: "Failed to load customer dashboard." });
  }
}