import { Request, Response } from "express";
import { mysqlQuery } from "../utils/mysqlQuery";

function normalizeUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function getPublicArtistProfile(req: Request, res: Response) {
  try {
    const username = normalizeUsername(req.params.username);

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        a.id,
        a.Full_name AS full_name,
        a.Stage_name AS stage_name,
        a.username,
        a.email,
        a.phone_no AS phone,
        NULL AS user_profile_image_url,
        ap.genre,
        ap.bio,
        ap.city,
        ap.barangay,
        ap.talent_fee,
        ap.facebook_url,
        ap.instagram_url,
        ap.youtube_url,
        ap.spotify_url,
        ap.profile_image_url,
        ap.cover_image_url
      FROM artist a
      LEFT JOIN artist_profiles ap ON ap.user_id = a.id
      WHERE LOWER(a.username) = ?
      LIMIT 1
      `,
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Artist not found" });
    }

    return res.status(200).json({
      role: "artist",
      profile: rows[0],
    });
  } catch (error: any) {
    console.error("getPublicArtistProfile error:", error);
    return res.status(500).json({
      message: "Failed to load artist profile",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function getPublicSessionistProfile(req: Request, res: Response) {
  try {
    const username = normalizeUsername(req.params.username);

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        s.id,
        s.Full_name AS full_name,
        s.Stage_Name AS stage_name,
        s.username,
        s.email,
        s.phone_no AS phone,
        NULL AS user_profile_image_url,
        sp.display_name,
        sp.instruments,
        sp.genre,
        sp.bio,
        sp.city,
        sp.barangay,
        sp.talent_fee,
        sp.experience_years,
        sp.facebook_url,
        sp.instagram_url,
        sp.youtube_url,
        sp.profile_image_url,
        sp.cover_image_url
      FROM sessionist s
      LEFT JOIN sessionist_profiles sp ON sp.user_id = s.id
      WHERE LOWER(s.username) = ?
      LIMIT 1
      `,
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Sessionist not found" });
    }

    return res.status(200).json({
      role: "sessionist",
      profile: rows[0],
    });
  } catch (error: any) {
    console.error("getPublicSessionistProfile error:", error);
    return res.status(500).json({
      message: "Failed to load sessionist profile",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function getPublicOrganizerProfile(req: Request, res: Response) {
  try {
    const username = normalizeUsername(req.params.username);

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        o.id,
        o.Organization_rep AS full_name,
        o.username,
        o.email,
        o.phone_no AS phone,
        NULL AS user_profile_image_url,
        op.organizer_name,
        op.company_name,
        op.bio,
        op.city,
        op.barangay,
        op.business_email,
        op.business_phone,
        op.street_address,
        op.facebook_url,
        op.instagram_url,
        op.website_url,
        op.profile_image_url,
        op.cover_image_url
      FROM organizer o
      LEFT JOIN organizer_profiles op ON op.user_id = o.id
      WHERE LOWER(o.username) = ?
      LIMIT 1
      `,
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Organizer not found" });
    }

    return res.status(200).json({
      role: "organizer",
      profile: rows[0],
    });
  } catch (error: any) {
    console.error("getPublicOrganizerProfile error:", error);
    return res.status(500).json({
      message: "Failed to load organizer profile",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function getPublicCustomerProfile(req: Request, res: Response) {
  try {
    const username = normalizeUsername(req.params.username);

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        c.id,
        c.name AS full_name,
        c.username,
        c.email,
        c.phone_no AS phone,
        NULL AS user_profile_image_url,
        cp.nickname,
        cp.bio,
        cp.city,
        cp.barangay,
        cp.preferred_genre,
        cp.timezone,
        cp.profile_image_url,
        cp.cover_image_url
      FROM customer c
      LEFT JOIN customer_profiles cp ON cp.user_id = c.id
      WHERE LOWER(c.username) = ?
      LIMIT 1
      `,
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.status(200).json({
      role: "customer",
      profile: rows[0],
    });
  } catch (error: any) {
    console.error("getPublicCustomerProfile error:", error);
    return res.status(500).json({
      message: "Failed to load customer profile",
      error: error?.message ?? "Unknown error",
    });
  }
}