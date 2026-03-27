import { Request, Response } from "express";
import { mysqlQuery } from "../utils/mysqlQuery";
import { getSessionistId } from "../utils/authHelpers";

export async function getSessionistDashboard(req: Request, res: Response) {
  try {
    const sessionistId = getSessionistId(req);

    if (!sessionistId) {
      return res.status(403).json({ message: "Only sessionists can access this dashboard." });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        id,
        Full_name,
        Stage_Name,
        username,
        email,
        phone_no,
        address,
        age,
        Birthday
      FROM sessionist
      WHERE id = ?
      LIMIT 1
      `,
      [sessionistId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Sessionist not found." });
    }

    const sessionist = rows[0];

    return res.json({
      profile: {
        id: sessionist.id,
        fullName: sessionist.Full_name,
        stageName: sessionist.Stage_Name,
        username: sessionist.username,
        email: sessionist.email,
        phone_no: sessionist.phone_no,
        address: sessionist.address,
        age: sessionist.age,
        birthday: sessionist.Birthday,
      },
    });
  } catch (error) {
    console.error("getSessionistDashboard error:", error);
    return res.status(500).json({ message: "Failed to load sessionist dashboard." });
  }
}