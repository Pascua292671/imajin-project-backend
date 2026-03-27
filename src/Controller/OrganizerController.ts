import { Request, Response } from "express";
import { mysqlQuery } from "../utils/mysqlQuery";
import { getOrganizerId } from "../utils/authHelpers";

export async function getOrganizerDashboard(req: Request, res: Response) {
  try {
    const organizerId = getOrganizerId(req);

    if (!organizerId) {
      return res.status(403).json({ message: "Only organizers can access this dashboard." });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        id,
        Organization_rep,
        username,
        email,
        phone_no,
        address,
        age,
        Birthday
      FROM organizer
      WHERE id = ?
      LIMIT 1
      `,
      [organizerId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Organizer not found." });
    }

    const organizer = rows[0];

    return res.json({
      profile: {
        id: organizer.id,
        fullName: organizer.Organization_rep,
        username: organizer.username,
        email: organizer.email,
        phone_no: organizer.phone_no,
        address: organizer.address,
        age: organizer.age,
        birthday: organizer.Birthday,
      },
    });
  } catch (error) {
    console.error("getOrganizerDashboard error:", error);
    return res.status(500).json({ message: "Failed to load organizer dashboard." });
  }
}