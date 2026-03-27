import { Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { mysqlQuery } from "../utils/mysqlQuery";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

type AuthenticatedUser = {
  id: number | string;
  user_id: number | string;
  role: UserRole;
  email?: string | null;
  username?: string | null;
};

const nullableTrimmedString = z.string().optional().nullable().or(z.literal(""));

const booleanLike = z.preprocess((value) => {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }

  return value;
}, z.boolean());

const numberLikeNullable = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().nullable());

const baseUserSchema = z.object({
  full_name: z.string().trim().min(1).max(150).optional(),
  username: z.string().trim().min(3).max(100).optional(),
  phone: z.string().trim().max(30).optional().nullable().or(z.literal("")),
});

const customerProfileSchema = z.object({
  nickname: nullableTrimmedString,
  bio: nullableTrimmedString,
  city: nullableTrimmedString,
  barangay: nullableTrimmedString,
  preferred_genre: nullableTrimmedString,
  timezone: nullableTrimmedString,
  receive_email_notifications: booleanLike.optional(),
  receive_sms_alerts: booleanLike.optional(),
  profile_image_url: nullableTrimmedString,
  cover_image_url: nullableTrimmedString,
});

const artistProfileSchema = z.object({
  genre: nullableTrimmedString,
  bio: nullableTrimmedString,
  city: nullableTrimmedString,
  barangay: nullableTrimmedString,
  talent_fee: numberLikeNullable.optional(),
  facebook_url: nullableTrimmedString,
  instagram_url: nullableTrimmedString,
  youtube_url: nullableTrimmedString,
  spotify_url: nullableTrimmedString,
  profile_image_url: nullableTrimmedString,
  cover_image_url: nullableTrimmedString,
});

const sessionistProfileSchema = z.object({
  display_name: nullableTrimmedString,
  instruments: nullableTrimmedString,
  genre: nullableTrimmedString,
  bio: nullableTrimmedString,
  city: nullableTrimmedString,
  barangay: nullableTrimmedString,
  talent_fee: numberLikeNullable.optional(),
  experience_years: numberLikeNullable.optional(),
  facebook_url: nullableTrimmedString,
  instagram_url: nullableTrimmedString,
  youtube_url: nullableTrimmedString,
  profile_image_url: nullableTrimmedString,
  cover_image_url: nullableTrimmedString,
});

const organizerProfileSchema = z.object({
  organizer_name: nullableTrimmedString,
  company_name: nullableTrimmedString,
  bio: nullableTrimmedString,
  city: nullableTrimmedString,
  barangay: nullableTrimmedString,
  street_address: nullableTrimmedString,
  business_email: nullableTrimmedString,
  business_phone: nullableTrimmedString,
  facebook_url: nullableTrimmedString,
  instagram_url: nullableTrimmedString,
  website_url: nullableTrimmedString,
  profile_image_url: nullableTrimmedString,
  cover_image_url: nullableTrimmedString,
});

function getAuthUser(req: Request): AuthenticatedUser | null {
  const user = req.user as AuthenticatedUser | undefined;

  if (!user) return null;
  if (!user.role) return null;
  if (user.user_id === undefined || user.user_id === null) return null;

  return user;
}

function normalizeEmptyStrings(obj: Record<string, any>) {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      normalized[key] = trimmed === "" ? null : trimmed;
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

function buildUpdateQuery(
  table: string,
  whereColumn: string,
  whereValue: string | number,
  rawData: Record<string, any>
) {
  const entries = Object.entries(rawData).filter(([, value]) => value !== undefined);

  if (entries.length === 0) return null;

  const setClause = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value);

  return {
    sql: `UPDATE ${table} SET ${setClause} WHERE ${whereColumn} = ?`,
    values: [...values, whereValue],
  };
}

function getProfileTable(role: UserRole) {
  switch (role) {
    case "customer":
      return "customer_profiles";
    case "artist":
      return "artist_profiles";
    case "sessionist":
      return "sessionist_profiles";
    case "organizer":
      return "organizer_profiles";
    default:
      throw new Error("Unsupported role");
  }
}

function normalizeBooleanFieldsForDb(role: UserRole, profile: Record<string, any>) {
  if (role !== "customer") return profile;

  return {
    ...profile,
    receive_email_notifications:
      profile.receive_email_notifications === undefined
        ? undefined
        : profile.receive_email_notifications
        ? 1
        : 0,
    receive_sms_alerts:
      profile.receive_sms_alerts === undefined
        ? undefined
        : profile.receive_sms_alerts
        ? 1
        : 0,
  };
}

function normalizeProfileForResponse(role: UserRole, profile: any) {
  if (!profile) return null;

  if (role !== "customer") return profile;

  return {
    ...profile,
    receive_email_notifications: Boolean(profile.receive_email_notifications),
    receive_sms_alerts: Boolean(profile.receive_sms_alerts),
  };
}

async function ensureProfileRowExists(userId: number, role: UserRole) {
  const table = getProfileTable(role);

  const rows = await mysqlQuery<any[]>(
    `SELECT id FROM ${table} WHERE user_id = ? LIMIT 1`,
    [userId]
  );

  if (rows.length > 0) return;

  await mysqlQuery(`INSERT INTO ${table} (id, user_id) VALUES (?, ?)`, [
    uuidv4(),
    userId,
  ]);
}

async function getBaseUser(role: UserRole, userId: number) {
  if (role === "customer") {
    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        c.id,
        c.name AS full_name,
        c.username,
        c.email,
        c.phone_no AS phone,
        c.Birthday AS birthday,
        aa.email_verified
      FROM customer c
      LEFT JOIN auth_accounts aa
        ON aa.role = 'customer' AND aa.user_id = c.id
      WHERE c.id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) return null;

    return {
      ...rows[0],
      role,
    };
  }

  if (role === "artist") {
    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        a.id,
        a.Full_name AS full_name,
        a.username,
        a.email,
        a.phone_no AS phone,
        a.Birthday AS birthday,
        aa.email_verified
      FROM artist a
      LEFT JOIN auth_accounts aa
        ON aa.role = 'artist' AND aa.user_id = a.id
      WHERE a.id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) return null;

    return {
      ...rows[0],
      role,
    };
  }

  if (role === "sessionist") {
    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        s.id,
        s.Full_name AS full_name,
        s.username,
        s.email,
        s.phone_no AS phone,
        s.Birthday AS birthday,
        aa.email_verified
      FROM sessionist s
      LEFT JOIN auth_accounts aa
        ON aa.role = 'sessionist' AND aa.user_id = s.id
      WHERE s.id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) return null;

    return {
      ...rows[0],
      role,
    };
  }

  const rows = await mysqlQuery<any[]>(
    `
    SELECT
      o.id,
      o.Organization_rep AS full_name,
      o.username,
      o.email,
      o.phone_no AS phone,
      o.Birthday AS birthday,
      aa.email_verified
    FROM organizer o
    LEFT JOIN auth_accounts aa
      ON aa.role = 'organizer' AND aa.user_id = o.id
    WHERE o.id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!rows.length) return null;

  return {
    ...rows[0],
    role,
  };
}

async function getRoleProfile(role: UserRole, userId: number) {
  const table = getProfileTable(role);

  const rows = await mysqlQuery<any[]>(
    `SELECT * FROM ${table} WHERE user_id = ? LIMIT 1`,
    [userId]
  );

  return rows?.[0] ?? null;
}

async function updateBaseUser(
  role: UserRole,
  userId: number,
  rawData: Record<string, any>
) {
  const parsedUser = normalizeEmptyStrings(baseUserSchema.parse(rawData));

  if (role === "customer") {
    const mapped: Record<string, any> = {
      name: parsedUser.full_name,
      username: parsedUser.username,
      phone_no: parsedUser.phone,
    };

    const update = buildUpdateQuery("customer", "id", userId, mapped);
    if (update) {
      await mysqlQuery(update.sql, update.values);
    }
  }

  if (role === "artist") {
    const mapped: Record<string, any> = {
      Full_name: parsedUser.full_name,
      username: parsedUser.username,
      phone_no: parsedUser.phone,
    };

    const update = buildUpdateQuery("artist", "id", userId, mapped);
    if (update) {
      await mysqlQuery(update.sql, update.values);
    }
  }

  if (role === "sessionist") {
    const mapped: Record<string, any> = {
      Full_name: parsedUser.full_name,
      username: parsedUser.username,
      phone_no: parsedUser.phone,
    };

    const update = buildUpdateQuery("sessionist", "id", userId, mapped);
    if (update) {
      await mysqlQuery(update.sql, update.values);
    }
  }

  if (role === "organizer") {
    const mapped: Record<string, any> = {
      Organization_rep: parsedUser.full_name,
      username: parsedUser.username,
      phone_no: parsedUser.phone,
    };

    const update = buildUpdateQuery("organizer", "id", userId, mapped);
    if (update) {
      await mysqlQuery(update.sql, update.values);
    }
  }

  if (parsedUser.username !== undefined && parsedUser.username !== null) {
    await mysqlQuery(
      `
      UPDATE auth_accounts
      SET username = ?
      WHERE role = ? AND user_id = ?
      `,
      [parsedUser.username, role, userId]
    );
  }
}

export async function getMyProfile(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = Number(authUser.user_id);
    const role = authUser.role;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid authenticated user id" });
    }

    const user = await getBaseUser(role, userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await ensureProfileRowExists(userId, role);

    const rawProfile = await getRoleProfile(role, userId);
    const profile = normalizeProfileForResponse(role, rawProfile);

    return res.status(200).json({
      role,
      user,
      profile,
    });
  } catch (error: any) {
    console.error("getMyProfile error:", error);
    return res.status(500).json({
      message: "Failed to load profile",
      error: error?.message ?? "Unknown error",
    });
  }
}

export async function upsertMyProfile(req: Request, res: Response) {
  try {
    const authUser = getAuthUser(req);

    if (!authUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = Number(authUser.user_id);
    const role = authUser.role;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid authenticated user id" });
    }

    const rawUser = req.body?.user ?? {};
    const rawProfile = req.body?.profile ?? {};

    const existingUser = await getBaseUser(role, userId);

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await ensureProfileRowExists(userId, role);
    await updateBaseUser(role, userId, rawUser);

    if (role === "customer") {
      const parsedProfile = normalizeEmptyStrings(
        customerProfileSchema.parse(rawProfile)
      );

      const normalizedProfile = normalizeBooleanFieldsForDb(role, parsedProfile);

      const profileUpdate = buildUpdateQuery(
        "customer_profiles",
        "user_id",
        userId,
        normalizedProfile
      );

      if (profileUpdate) {
        await mysqlQuery(profileUpdate.sql, profileUpdate.values);
      }
    }

    if (role === "artist") {
      const parsedProfile = normalizeEmptyStrings(
        artistProfileSchema.parse(rawProfile)
      );

      const profileUpdate = buildUpdateQuery(
        "artist_profiles",
        "user_id",
        userId,
        parsedProfile
      );

      if (profileUpdate) {
        await mysqlQuery(profileUpdate.sql, profileUpdate.values);
      }
    }

    if (role === "sessionist") {
      const parsedProfile = normalizeEmptyStrings(
        sessionistProfileSchema.parse(rawProfile)
      );

      const profileUpdate = buildUpdateQuery(
        "sessionist_profiles",
        "user_id",
        userId,
        parsedProfile
      );

      if (profileUpdate) {
        await mysqlQuery(profileUpdate.sql, profileUpdate.values);
      }
    }

    if (role === "organizer") {
      const parsedProfile = normalizeEmptyStrings(
        organizerProfileSchema.parse(rawProfile)
      );

      const profileUpdate = buildUpdateQuery(
        "organizer_profiles",
        "user_id",
        userId,
        parsedProfile
      );

      if (profileUpdate) {
        await mysqlQuery(profileUpdate.sql, profileUpdate.values);
      }
    }

    return getMyProfile(req, res);
  } catch (error: any) {
    console.error("upsertMyProfile error:", error);

    if (error?.name === "ZodError") {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
      });
    }

    return res.status(500).json({
      message: "Failed to save profile",
      error: error?.message ?? "Unknown error",
    });
  }
}