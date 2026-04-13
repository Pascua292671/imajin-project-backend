import { Request, Response } from "express";
import { mysqlQuery } from "../utils/mysqlQuery";

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function listArtists(req: Request, res: Response) {
  try {
    const q = clean(req.query.q);
    const genre = clean(req.query.genre);
    const city = clean(req.query.city);

    const conditions: string[] = [];
    const values: any[] = [];

    if (q) {
      conditions.push(`
        (
          LOWER(a.username) LIKE ?
          OR LOWER(a.Full_name) LIKE ?
          OR LOWER(a.Stage_name) LIKE ?
          OR LOWER(COALESCE(ap.genre, '')) LIKE ?
          OR LOWER(COALESCE(ap.city, '')) LIKE ?
          OR LOWER(COALESCE(ap.barangay, '')) LIKE ?
        )
      `);

      const like = `%${q.toLowerCase()}%`;
      values.push(like, like, like, like, like, like);
    }

    if (genre) {
      conditions.push(`LOWER(COALESCE(ap.genre, '')) LIKE ?`);
      values.push(`%${genre.toLowerCase()}%`);
    }

    if (city) {
      conditions.push(`LOWER(COALESCE(ap.city, '')) LIKE ?`);
      values.push(`%${city.toLowerCase()}%`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        a.id,
        a.Full_name,
        a.Stage_name,
        a.username,
        a.email,
        a.phone_no AS Contact_no,
        a.address,
        ap.bio,
        ap.city,
        ap.barangay,
        ap.genre,
        ap.talent_fee,
        ap.facebook_url,
        ap.instagram_url,
        ap.youtube_url,
        ap.spotify_url,
        ap.profile_image_url,
        ap.cover_image_url
      FROM artist a
      LEFT JOIN artist_profiles ap ON ap.user_id = a.id
      ${whereClause}
      ORDER BY a.id DESC
      `,
      values
    );

    return res.json({
      items: rows,
      total: rows.length,
    });
  } catch (error: any) {
    console.error("listArtists error:", error);
    return res.status(500).json({
      message: "Failed to load artists",
      error: error?.message ?? "Unknown error",
    });
  }
}

/* export async function getArtistById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        a.id,
        a.Full_name,
        a.Stage_name,
        a.username,
        a.email,
        a.Contact_no,
        a.address,
        ap.bio,
        ap.city,
        ap.barangay,
        ap.genre,
        ap.talent_fee,
        ap.facebook_url,
        ap.instagram_url,
        ap.youtube_url,
        ap.spotify_url,
        ap.profile_image_url,
        ap.cover_image_url
      FROM artist a
      LEFT JOIN artist_profiles ap ON ap.user_id = a.id
      WHERE a.id = ?
      LIMIT 1
      `,
      [id]
    );

    const artist = rows[0];

    if (!artist) {
      return res.status(404).json({
        message: "Artist not found",
      });
    }

    return res.json({
      item: artist,
    });
  } catch (error: any) {
    console.error("getArtistById error:", error);
    return res.status(500).json({
      message: "Failed to load artist",
      error: error?.message ?? "Unknown error",
    });
  }
} */

export async function getArtistById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        a.id,
        a.Full_name,
        a.Stage_name,
        a.username,
        a.email,
        a.phone_no AS Contact_no,
        a.address,
        ap.bio,
        ap.city,
        ap.barangay,
        ap.genre,
        ap.talent_fee,
        ap.facebook_url,
        ap.instagram_url,
        ap.youtube_url,
        ap.spotify_url,
        ap.profile_image_url,
        ap.cover_image_url
      FROM artist a
      LEFT JOIN artist_profiles ap ON ap.user_id = a.id
      WHERE a.id = ?
      LIMIT 1
      `,
      [id]
    );

    const artist = rows[0];

    if (!artist) {
      return res.status(404).json({
        message: "Artist not found",
      });
    }

    return res.json({
      item: artist,
    });
  } catch (error: any) {
    console.error("getArtistById error:", error);
    return res.status(500).json({
      message: "Failed to load artist",
      error: error?.message ?? "Unknown error",
    });
  }
}




export async function listSessionists(req: Request, res: Response) {
  try {
    const q = clean(req.query.q);
    const genre = clean(req.query.genre);
    const city = clean(req.query.city);

    const conditions: string[] = [];
    const values: any[] = [];

    if (q) {
      conditions.push(`
        (
          LOWER(s.username) LIKE ?
          OR LOWER(s.Full_name) LIKE ?
          OR LOWER(s.Stage_Name) LIKE ?
          OR LOWER(COALESCE(sp.genre, '')) LIKE ?
          OR LOWER(COALESCE(sp.instruments, '')) LIKE ?
          OR LOWER(COALESCE(sp.city, '')) LIKE ?
          OR LOWER(COALESCE(sp.barangay, '')) LIKE ?
        )
      `);

      const like = `%${q.toLowerCase()}%`;
      values.push(like, like, like, like, like, like, like);
    }

    if (genre) {
      conditions.push(`LOWER(COALESCE(sp.genre, '')) LIKE ?`);
      values.push(`%${genre.toLowerCase()}%`);
    }

    if (city) {
      conditions.push(`LOWER(COALESCE(sp.city, '')) LIKE ?`);
      values.push(`%${city.toLowerCase()}%`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        s.id,
        s.Full_name,
        s.Stage_Name,
        s.username,
        s.email,
        s.phone_no,
        s.address,
        sp.bio,
        sp.city,
        sp.barangay,
        sp.genre,
        sp.instruments,
        sp.talent_fee,
        sp.experience_years,
        sp.facebook_url,
        sp.instagram_url,
        sp.youtube_url,
        sp.profile_image_url
      FROM sessionist s
      LEFT JOIN sessionist_profiles sp ON sp.user_id = s.id
      ${whereClause}
      ORDER BY s.id DESC
      `,
      values
    );

    return res.json({
      items: rows,
      total: rows.length,
    });
  } catch (error: any) {
    console.error("listSessionists error:", error);
    return res.status(500).json({
      message: "Failed to load sessionists",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function getSessionistById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        s.id,
        s.Full_name,
        s.Stage_Name,
        s.username,
        s.email,
        s.phone_no,
        s.address,
        sp.bio,
        sp.city,
        sp.barangay,
        sp.genre,
        sp.instruments,
        sp.talent_fee,
        sp.experience_years,
        sp.facebook_url,
        sp.instagram_url,
        sp.youtube_url,
        sp.profile_image_url
      FROM sessionist s
      LEFT JOIN sessionist_profiles sp ON sp.user_id = s.id
      WHERE s.id = ?
      LIMIT 1
      `,
      [id]
    );

    const sessionist = rows[0];

    if (!sessionist) {
      return res.status(404).json({
        message: "Sessionist not found",
      });
    }

    return res.json({
      item: sessionist,
    });
  } catch (error: any) {
    console.error("getSessionistById error:", error);
    return res.status(500).json({
      message: "Failed to load sessionist",
      error: error?.message ?? "Unknown error",
    });
  }
}