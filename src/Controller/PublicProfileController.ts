import { Request, Response } from "express";
import { mysqlQuery } from "../utils/mysqlQuery";

function normalizeUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function toBoolean(value: unknown) {
  return value === 1 || value === true;
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
        ap.stage_name AS profile_stage_name,
        ap.genre,
        ap.event_types,
        ap.performance_types,
        ap.travel_policy,
        ap.can_travel,
        ap.base_city,
        ap.availability_notes,
        ap.languages_supported,
        ap.performance_duration_options,
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

    const row = rows[0];

    return res.status(200).json({
      role: "artist",
      profile: {
        id: row.id,
        full_name: row.full_name,
        stage_name: row.profile_stage_name ?? row.stage_name ?? null,
        username: row.username,
        genre: row.genre,
        event_types: row.event_types,
        performance_types: row.performance_types,
        travel_policy: row.travel_policy,
        can_travel: toBoolean(row.can_travel),
        base_city: row.base_city,
        availability_notes: row.availability_notes,
        languages_supported: row.languages_supported,
        performance_duration_options: row.performance_duration_options,
        bio: row.bio,
        city: row.city,
        barangay: row.barangay,
        talent_fee: row.talent_fee,
        facebook_url: row.facebook_url,
        instagram_url: row.instagram_url,
        youtube_url: row.youtube_url,
        spotify_url: row.spotify_url,
        profile_image_url: row.profile_image_url,
        cover_image_url: row.cover_image_url,
      },
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
        sp.display_name,
        sp.primary_instrument,
        sp.secondary_instruments,
        sp.instruments,
        sp.genre,
        sp.event_types,
        sp.travel_policy,
        sp.can_travel,
        sp.availability_notes,
        sp.languages_supported,
        sp.performance_duration_options,
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

    const row = rows[0];

    return res.status(200).json({
      role: "sessionist",
      profile: {
        id: row.id,
        full_name: row.full_name,
        stage_name: row.stage_name,
        display_name: row.display_name,
        username: row.username,
        primary_instrument: row.primary_instrument,
        secondary_instruments: row.secondary_instruments,
        instruments: row.instruments,
        genre: row.genre,
        event_types: row.event_types,
        travel_policy: row.travel_policy,
        can_travel: toBoolean(row.can_travel),
        availability_notes: row.availability_notes,
        languages_supported: row.languages_supported,
        performance_duration_options: row.performance_duration_options,
        bio: row.bio,
        city: row.city,
        barangay: row.barangay,
        talent_fee: row.talent_fee,
        experience_years: row.experience_years,
        facebook_url: row.facebook_url,
        instagram_url: row.instagram_url,
        youtube_url: row.youtube_url,
        profile_image_url: row.profile_image_url,
        cover_image_url: row.cover_image_url,
      },
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
        op.organizer_name,
        op.company_name,
        op.bio,
        op.city,
        op.barangay,
        op.street_address,
        op.business_email,
        op.business_phone,
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

    const row = rows[0];

    return res.status(200).json({
      role: "organizer",
      profile: {
        id: row.id,
        full_name: row.full_name,
        username: row.username,
        organizer_name: row.organizer_name,
        company_name: row.company_name,
        bio: row.bio,
        city: row.city,
        barangay: row.barangay,
        street_address: row.street_address,
        business_email: row.business_email,
        business_phone: row.business_phone,
        facebook_url: row.facebook_url,
        instagram_url: row.instagram_url,
        website_url: row.website_url,
        profile_image_url: row.profile_image_url,
        cover_image_url: row.cover_image_url,
      },
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

    const row = rows[0];

    return res.status(200).json({
      role: "customer",
      profile: {
        id: row.id,
        full_name: row.full_name,
        username: row.username,
        nickname: row.nickname,
        bio: row.bio,
        city: row.city,
        barangay: row.barangay,
        preferred_genre: row.preferred_genre,
        timezone: row.timezone,
        profile_image_url: row.profile_image_url,
        cover_image_url: row.cover_image_url,
      },
    });
  } catch (error: any) {
    console.error("getPublicCustomerProfile error:", error);
    return res.status(500).json({
      message: "Failed to load customer profile",
      error: error?.message ?? "Unknown error",
    });
  }
}