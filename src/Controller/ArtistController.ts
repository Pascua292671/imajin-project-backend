import { Request, Response } from "express";
import { mysqlQuery } from "../utils/mysqlQuery";
import { getArtistId } from "../utils/authHelpers";

export async function getArtistDashboard(req: Request, res: Response) {
  try {
    const artistId = getArtistId(req);

    if (!artistId) {
      return res.status(403).json({ message: "Only artists can access this dashboard." });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        id,
        Full_name,
        Stage_name,
        username,
        email,
        phone_no,
        address,
        age,
        Birthday
      FROM artist
      WHERE id = ?
      LIMIT 1
      `,
      [artistId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Artist not found." });
    }

    const artist = rows[0];

    return res.json({
      profile: {
        id: artist.id,
        fullName: artist.Full_name,
        stageName: artist.Stage_name,
        username: artist.username,
        email: artist.email,
        phone_no: artist.phone_no,
        address: artist.address,
        age: artist.age,
        birthday: artist.Birthday,
      },
    });
  } catch (error) {
    console.error("getArtistDashboard error:", error);
    return res.status(500).json({ message: "Failed to load artist dashboard." });
  }
}