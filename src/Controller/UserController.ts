import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import z from "zod";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { mysqlQuery } from "../utils/mysqlQuery";

type UserRole = "customer" | "artist" | "sessionist" | "organizer";

type AuthAccountRow = {
  id: number;
  email: string;
  role: UserRole;
  user_id: number;
  username: string;
  google_sub: string | null;
  email_verified: number;
};

type NormalizedUser = {
  id: number;
  role: UserRole;
  email: string;
  username: string;
  password: string | null;
  fullName: string;
  phone_no: string | null;
  address: string | null;
  age: string | number | null;
  birthday: string | null;
};

const ACCESS_COOKIE_NAME = "accessToken";
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* =========================
   HELPERS
========================= */

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function signAccessToken(user: {
  id?: number;
  role: UserRole;
  user_id: number;
  email: string;
  username: string;
}) {
  return jwt.sign(
    {
      id: Number(user.id ?? user.user_id),
      user_id: Number(user.user_id),
      role: user.role,
      email: user.email,
      username: user.username,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: "1d" },
  );
}
function setAuthCookie(res: Response, token: string) {
  res.cookie(ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24,
  });
}

function clearAuthCookie(res: Response) {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host) throw new Error("SMTP_HOST is missing");
  if (!process.env.SMTP_USER) throw new Error("SMTP_USER is missing");
  if (!process.env.SMTP_PASS) throw new Error("SMTP_PASS is missing");
  if (!process.env.SMTP_FROM) throw new Error("SMTP_FROM is missing");

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function getAuthAccountByEmail(
  email: string,
): Promise<AuthAccountRow | null> {
  const rows = await mysqlQuery<AuthAccountRow[]>(
    `SELECT * FROM auth_accounts WHERE email = ? LIMIT 1`,
    [email.toLowerCase()],
  );
  return rows?.[0] ?? null;
}

async function getAuthAccountByUsername(
  username: string,
): Promise<AuthAccountRow | null> {
  const rows = await mysqlQuery<AuthAccountRow[]>(
    `SELECT * FROM auth_accounts WHERE LOWER(username) = ? LIMIT 1`,
    [username.toLowerCase()],
  );
  return rows?.[0] ?? null;
}

async function getNormalizedUserByRoleAndId(
  role: UserRole,
  userId: number,
): Promise<NormalizedUser | null> {
  if (role === "customer") {
    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        id,
        email,
        username,
        password,
        name AS fullName,
        phone_no,
        address,
        age,
        Birthday AS birthday
      FROM customer
      WHERE id = ?
      LIMIT 1
      `,
      [userId],
    );

    if (!rows.length) return null;

    return {
      id: Number(rows[0].id),
      role,
      email: rows[0].email,
      username: rows[0].username,
      password: rows[0].password,
      fullName: rows[0].fullName,
      phone_no: rows[0].phone_no,
      address: rows[0].address,
      age: rows[0].age,
      birthday: rows[0].birthday,
    };
  }

  if (role === "artist") {
    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        id,
        email,
        username,
        password,
        Full_name AS fullName,
        phone_no,
        address,
        age,
        Birthday AS birthday
      FROM artist
      WHERE id = ?
      LIMIT 1
      `,
      [userId],
    );

    if (!rows.length) return null;

    return {
      id: Number(rows[0].id),
      role,
      email: rows[0].email,
      username: rows[0].username,
      password: rows[0].password,
      fullName: rows[0].fullName,
      phone_no: rows[0].phone_no,
      address: rows[0].address,
      age: rows[0].age,
      birthday: rows[0].birthday,
    };
  }

  if (role === "sessionist") {
    const rows = await mysqlQuery<any[]>(
      `
      SELECT
        id,
        email,
        username,
        password,
        Full_name AS fullName,
        phone_no,
        address,
        age,
        Birthday AS birthday
      FROM sessionist
      WHERE id = ?
      LIMIT 1
      `,
      [userId],
    );

    if (!rows.length) return null;

    return {
      id: Number(rows[0].id),
      role,
      email: rows[0].email,
      username: rows[0].username,
      password: rows[0].password,
      fullName: rows[0].fullName,
      phone_no: rows[0].phone_no,
      address: rows[0].address,
      age: rows[0].age,
      birthday: rows[0].birthday,
    };
  }

  const rows = await mysqlQuery<any[]>(
    `
    SELECT
      id,
      email,
      username,
      password,
      Organization_rep AS fullName,
      phone_no,
      address,
      age,
      Birthday AS birthday
    FROM organizer
    WHERE id = ?
    LIMIT 1
    `,
    [userId],
  );

  if (!rows.length) return null;

  return {
    id: Number(rows[0].id),
    role,
    email: rows[0].email,
    username: rows[0].username,
    password: rows[0].password,
    fullName: rows[0].fullName,
    phone_no: rows[0].phone_no,
    address: rows[0].address,
    age: rows[0].age,
    birthday: rows[0].birthday,
  };
}

async function getNormalizedUserByEmail(
  email: string,
): Promise<NormalizedUser | null> {
  const auth = await getAuthAccountByEmail(email);
  if (!auth) return null;
  return getNormalizedUserByRoleAndId(auth.role, Number(auth.user_id));
}

async function getNormalizedUserByUsername(
  username: string,
): Promise<NormalizedUser | null> {
  const auth = await getAuthAccountByUsername(username);
  if (!auth) return null;
  return getNormalizedUserByRoleAndId(auth.role, Number(auth.user_id));
}

async function assertUsernameAvailable(username: string) {
  const uname = String(username || "")
    .trim()
    .toLowerCase();

  if (!uname) throw new Error("username is required");

  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(uname)) {
    throw new Error(
      "Invalid username format. Use 3-50 chars: letters, numbers, dot, underscore, dash.",
    );
  }

  const existing = await getAuthAccountByUsername(uname);
  if (existing) {
    throw new Error("Username already exists");
  }

  return uname;
}

async function upsertAuthAccount(params: {
  email: string;
  role: UserRole;
  user_id: number;
  username: string;
  google_sub?: string | null;
  email_verified?: number;
}) {
  const {
    email,
    role,
    user_id,
    username,
    google_sub = null,
    email_verified = 0,
  } = params;

  await mysqlQuery(
    `
    INSERT INTO auth_accounts (email, role, user_id, username, google_sub, email_verified)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      role = VALUES(role),
      user_id = VALUES(user_id),
      username = VALUES(username),
      google_sub = COALESCE(VALUES(google_sub), auth_accounts.google_sub),
      email_verified = GREATEST(auth_accounts.email_verified, VALUES(email_verified))
    `,
    [
      email.toLowerCase(),
      role,
      user_id,
      username.toLowerCase(),
      google_sub,
      email_verified,
    ],
  );
}

async function markEmailVerified(email: string) {
  await mysqlQuery(
    `
    UPDATE auth_accounts
    SET email_verified = 1
    WHERE email = ?
    `,
    [email.toLowerCase()],
  );
}

async function createAndSendEmailOtp(email: string) {
  console.log("[OTP] start for:", email);

  const transporter = getTransporter();

  const recent = await mysqlQuery<any[]>(
    `
    SELECT id
    FROM email_otps
    WHERE email = ?
      AND created_at > (NOW() - INTERVAL 60 SECOND)
    ORDER BY id DESC
    LIMIT 1
    `,
    [email],
  );

  console.log("[OTP] recent count:", recent.length);

  if (recent.length) {
    throw new Error(
      "OTP recently sent. Please wait a bit before requesting again.",
    );
  }

  await mysqlQuery(
    `
    UPDATE email_otps
    SET consumed_at = NOW()
    WHERE email = ?
      AND consumed_at IS NULL
      AND expires_at > NOW()
    `,
    [email],
  );

  console.log("[OTP] previous active OTPs consumed");

  const code = generateOtpCode();
  const codeHash = sha256(code);

  await mysqlQuery(
    `
    INSERT INTO email_otps (email, code_hash, expires_at)
    VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
    `,
    [email, codeHash],
  );

  console.log("[OTP] new OTP inserted");

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your OTP Code",
    text: `Your OTP code is: ${code}\nThis code expires in 10 minutes.`,
  });

  console.log("[OTP] email sent successfully");
}

async function createRoleUser(params: {
  role: UserRole;
  fullName: string;
  username: string;
  email: string;
  passwordHash: string;
  phone: string;
  address: string;
  age: string | number;
  birthday: string;
}) {
  const {
    role,
    fullName,
    username,
    email,
    passwordHash,
    phone,
    address,
    age,
    birthday,
  } = params;

  if (role === "customer") {
    const result: any = await mysqlQuery(
      `
      INSERT INTO customer (name, username, email, password, phone_no, address, age, Birthday)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        fullName,
        username,
        email,
        passwordHash,
        phone,
        address,
        String(age),
        birthday,
      ],
    );
    return Number(result.insertId);
  }

  if (role === "artist") {
    const result: any = await mysqlQuery(
      `
      INSERT INTO artist (Full_name, Stage_name, username, email, password, phone_no, address, age, Birthday)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        fullName,
        fullName,
        username,
        email,
        passwordHash,
        phone,
        address,
        Number(age),
        birthday,
      ],
    );
    return Number(result.insertId);
  }

  if (role === "sessionist") {
    const result: any = await mysqlQuery(
      `
      INSERT INTO sessionist (Full_name, Stage_Name, username, email, password, phone_no, address, age, Birthday)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        fullName,
        fullName,
        username,
        email,
        passwordHash,
        phone,
        address,
        Number(age),
        birthday,
      ],
    );
    return Number(result.insertId);
  }

  const result: any = await mysqlQuery(
    `
    INSERT INTO organizer (Organization_rep, username, email, password, phone_no, address, age, Birthday)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      fullName,
      username,
      email,
      passwordHash,
      phone,
      address,
      Number(age),
      birthday,
    ],
  );
  return Number(result.insertId);
}

/* =========================
   VALIDATION
========================= */

export const loginSchema = z
  .object({
    username: z.string().min(3, "Username is required"),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

/* =========================
   USERNAME AVAILABILITY
========================= */

export async function checkUsernameAvailability(req: Request, res: Response) {
  try {
    const raw = String(req.query.username || "")
      .trim()
      .toLowerCase();

    if (!raw) {
      return res.status(400).json({
        available: false,
        message: "Username is required",
      });
    }

    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(raw)) {
      return res.status(400).json({
        available: false,
        message:
          "Invalid username format (3-50 chars: letters, numbers, . _ -)",
      });
    }

    const existing = await getAuthAccountByUsername(raw);

    return res.json({
      available: !existing,
      ...(existing ? { message: "Username already exists" } : {}),
    });
  } catch (err) {
    console.error("username check error:", err);
    return res.status(500).json({
      available: false,
      message: "Server error",
    });
  }
}

/* =========================
   REQUEST OTP
========================= */

export const requestEmailOtp = async (req: Request, res: Response) => {
  try {
    const schema = z.object({ email: z.string().email() }).strict();
    const { email } = schema.parse(req.body);

    const user = await getNormalizedUserByEmail(email.toLowerCase());
    if (!user) {
      return res
        .status(404)
        .json({ message: "No account found for this email." });
    }

    await createAndSendEmailOtp(user.email);
    return res.json({ message: "OTP sent to email." });
  } catch (err: any) {
    if (err?.message?.includes("OTP recently sent")) {
      return res.status(429).json({ message: err.message });
    }
    if (err?.name === "ZodError") {
      return res
        .status(400)
        .json({ message: "Invalid request body", error: err.errors });
    }
    console.error("requestEmailOtp error:", err);
    return res
      .status(500)
      .json({ message: "Failed to send OTP", error: err?.message });
  }
};

/* =========================
   VERIFY OTP
========================= */

export const verifyEmailOtp = async (req: Request, res: Response) => {
  try {
    const schema = z
      .object({
        email: z.string().email(),
        code: z.string().length(6),
      })
      .strict();

    const { email, code } = schema.parse(req.body);

    const rows = await mysqlQuery<any[]>(
      `
      SELECT *
      FROM email_otps
      WHERE email = ?
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [email.toLowerCase()],
    );

    if (!rows.length) {
      return res
        .status(400)
        .json({ message: "OTP expired or not found. Request a new OTP." });
    }

    const otpRow = rows[0];

    if (sha256(code) !== otpRow.code_hash) {
      return res.status(401).json({ message: "Invalid OTP code." });
    }

    await mysqlQuery(`UPDATE email_otps SET consumed_at = NOW() WHERE id = ?`, [
      otpRow.id,
    ]);

    await markEmailVerified(email.toLowerCase());

    const auth = await getAuthAccountByEmail(email.toLowerCase());
    if (!auth) {
      return res.status(404).json({ message: "Auth account not found." });
    }

    const user = await getNormalizedUserByRoleAndId(
      auth.role,
      Number(auth.user_id),
    );
    if (!user) {
      return res.status(404).json({ message: "User record not found." });
    }

    const token = signAccessToken({
      id: Number(auth.user_id),
      role: auth.role,
      user_id: Number(auth.user_id),
      email: auth.email,
      username: auth.username,
    });

    setAuthCookie(res, token);

    return res.status(200).json({
      message: "OTP verified successfully",
      user: {
        id: user.id,
        role: auth.role,
        user_id: Number(auth.user_id),
        email: auth.email,
        username: auth.username,
        fullName: user.fullName,
      },
      token,
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res
        .status(400)
        .json({ message: "Invalid request body", error: err.errors });
    }
    console.error("verifyEmailOtp error:", err);
    return res
      .status(500)
      .json({ message: "OTP verification failed", error: err?.message });
  }
};

/* =========================
   SESSION ME
========================= */

export const me = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await getNormalizedUserByRoleAndId(
      req.user.role,
      Number(req.user.user_id),
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        role: req.user.role,
        user_id: req.user.user_id,
        email: req.user.email,
        username: req.user.username,
        fullName: user.fullName,
        phone_no: user.phone_no,
        address: user.address,
        age: user.age,
        birthday: user.birthday,
      },
    });
  } catch (err: any) {
    console.error("me error:", err);
    return res.status(500).json({
      message: "Failed to fetch current user",
      error: err?.message,
    });
  }
};

/* =========================
   REGISTER USER
========================= */

export const registerUser = async (req: Request, res: Response) => {
  try {
    const body = req.body as any;

    const role = String(body.role || "").toLowerCase() as UserRole;
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const phone = String(
      body.phone_no ?? body.contactNum ?? body.phoneNumber ?? "",
    ).trim();
    const address = String(body.address ?? body.adress ?? "").trim();
    const birthday = String(
      body.Birthday ?? body.birth_date ?? body.birthday ?? "",
    ).trim();
    const age = body.age;
    const usernameRaw = String(body.username || "").trim();

    const name = String(body.name || "").trim();
    const full_name = String(body.full_name || "").trim();
    const organization_rep = String(body.organization_rep || "").trim();

    if (!["customer", "artist", "sessionist", "organizer"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "email and password are required" });
    }

    if (!usernameRaw) {
      return res.status(400).json({ message: "username is required" });
    }

    let username: string;
    try {
      username = await assertUsernameAvailable(usernameRaw);
    } catch (e: any) {
      return res
        .status(409)
        .json({ message: e.message || "Username already exists" });
    }

    const existingEmail = await getAuthAccountByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let fullName = "";

    if (role === "customer") {
      if (!name || !phone || !address || age == null || !birthday) {
        return res
          .status(400)
          .json({ message: "Missing required Customer fields" });
      }
      fullName = name;
    }

    if (role === "artist") {
      if (!full_name || !phone || !address || age == null || !birthday) {
        return res
          .status(400)
          .json({ message: "Missing required Artist fields" });
      }
      fullName = full_name;
    }

    if (role === "sessionist") {
      if (!full_name || !phone || !address || age == null || !birthday) {
        return res
          .status(400)
          .json({ message: "Missing required Sessionist fields" });
      }
      fullName = full_name;
    }

    if (role === "organizer") {
      if (!organization_rep || !phone || !address || age == null || !birthday) {
        return res
          .status(400)
          .json({ message: "Missing required Organizer fields" });
      }
      fullName = organization_rep;
    }

    const legacyUserId = await createRoleUser({
      role,
      fullName,
      username,
      email,
      passwordHash: hashedPassword,
      phone,
      address,
      age,
      birthday,
    });

    await upsertAuthAccount({
      email,
      role,
      user_id: legacyUserId,
      username,
      email_verified: 0,
    });

    await createAndSendEmailOtp(email);

    return res.status(201).json({
      message: "Account created. OTP sent to email for verification.",
      requiresOtp: true,
      email,
    });
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Duplicate entry. Email/username already exists.",
      });
    }
    if (err?.message?.includes("OTP recently sent")) {
      return res.status(429).json({ message: err.message });
    }
    console.error("Register error:", err);
    return res
      .status(500)
      .json({ message: "Register failed", error: err?.message });
  }
};

/* =========================
   LOGIN / LOGOUT
========================= */

/* export const logoutUser = async (_req: Request, res: Response) => {
  clearAuthCookie(res);
  return res.status(200).json({ message: "Logged out" });
}; */


/* export const logoutUser = async (_req: Request, res: Response) => {
  try {
    const isProduction = process.env.NODE_ENV === "production";

    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    });

    return res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error: any) {
    console.error("Logout failed:", error);
    return res.status(500).json({
      message: "Logout failed",
      error: error?.message || "Unknown error",
    });
  }
}; */

 export const loginUser = async (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const uname = String(username || "")
      .trim()
      .toLowerCase();

    const user = await getNormalizedUserByUsername(uname);
    if (!user || !user.password) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    await createAndSendEmailOtp(user.email);

    return res.status(202).json({
      message: "OTP sent. Please verify to complete login.",
      requiresOtp: true,
      email: user.email,
    });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res
        .status(400)
        .json({ message: "Invalid request body", error: e.errors });
    }
    if (e?.message?.includes("OTP recently sent")) {
      return res.status(429).json({ message: e.message });
    }
    console.error("Login failed:", e);
    return res.status(500).json({ message: "Login failed", error: e.message });
  }
};

export const logoutUser = async (_req: Request, res: Response) => {
  try {
    clearAuthCookie(res);

    // optional if may refresh token ka talaga
    res.clearCookie("refreshToken", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error: any) {
    console.error("Logout failed:", error);
    return res.status(500).json({
      message: "Logout failed",
      error: error?.message || "Unknown error",
    });
  }
};






/* =========================
   GOOGLE AUTH
========================= */

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const schema = z
      .object({
        idToken: z.string().min(10),
      })
      .strict();

    const { idToken } = schema.parse(req.body);

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email || !payload?.sub) {
      return res.status(401).json({ message: "Invalid Google token." });
    }

    const email = payload.email.toLowerCase();
    const googleSub = payload.sub;

    const auth = await getAuthAccountByEmail(email);

    if (!auth) {
      return res.status(404).json({
        message:
          "No account found for this Google email. Please sign up first.",
        needsSignup: true,
        email,
      });
    }

    await upsertAuthAccount({
      email: auth.email,
      role: auth.role,
      user_id: Number(auth.user_id),
      username: auth.username,
      google_sub: googleSub,
      email_verified: payload.email_verified ? 1 : auth.email_verified,
    });

    const user = await getNormalizedUserByRoleAndId(
      auth.role,
      Number(auth.user_id),
    );
    if (!user) {
      return res.status(404).json({
        message: "Linked role account not found.",
      });
    }

    await createAndSendEmailOtp(email);

    return res.status(202).json({
      message: "OTP sent. Please verify to complete Google login.",
      requiresOtp: true,
      email,
      role: auth.role,
      user_id: auth.user_id,
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res
        .status(400)
        .json({ message: "Invalid request body", error: err.errors });
    }
    if (err?.message?.includes("OTP recently sent")) {
      return res.status(429).json({ message: err.message });
    }
    console.error("googleAuth error:", err);
    return res
      .status(500)
      .json({ message: "Google auth failed", error: err?.message });
  }
};

/* =========================
   GOOGLE PASSPORT CALLBACK
========================= */

export const googlePassportCallback = async (req: Request, res: Response) => {
  try {
    const rawUser = req.user as {
      email?: string;
      googleSub?: string;
    };

    console.log("[GOOGLE CALLBACK] raw req.user:", rawUser);

    const email = rawUser?.email ?? null;
    const googleSub = rawUser?.googleSub ?? null;

    if (!email || !googleSub) {
      console.error("[GOOGLE CALLBACK] Missing email or googleSub");
      return res.redirect("http://localhost:3000/login?google=invalid");
    }

    const normalizedEmail = email.toLowerCase();

    console.log("[GOOGLE CALLBACK] normalized email:", normalizedEmail);

    const auth = await getAuthAccountByEmail(normalizedEmail);
    console.log("[GOOGLE CALLBACK] auth lookup:", auth);

    if (!auth) {
      console.log("[GOOGLE CALLBACK] redirect → no account");
      return res.redirect(
        `http://localhost:3000/login?google=no-account&email=${encodeURIComponent(
          normalizedEmail,
        )}`,
      );
    }

    await upsertAuthAccount({
      email: auth.email,
      role: auth.role,
      user_id: Number(auth.user_id),
      username: auth.username,
      google_sub: googleSub,
      email_verified: 1,
    });

    console.log("[GOOGLE CALLBACK] auth updated with google_sub");

    try {
      await createAndSendEmailOtp(auth.email);
      console.log("[GOOGLE CALLBACK] OTP sent");
    } catch (otpError: any) {
      const msg = String(otpError?.message || "");

      if (!msg.toLowerCase().includes("otp recently sent")) {
        console.error("[GOOGLE CALLBACK] OTP error:", otpError);
        throw otpError;
      }

      console.warn("[GOOGLE CALLBACK] OTP cooldown hit, continue login");
    }

    console.log("[GOOGLE CALLBACK] redirecting to /otp");

    return res.redirect(
      `http://localhost:3000/otp?email=${encodeURIComponent(auth.email)}&google=1`,
    );
  } catch (err) {
    console.error("googlePassportCallback error:", err);
    return res.redirect("http://localhost:3000/login?google=failed");
  }
};

export const requestPasswordResetOtp = async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
    }).strict();

    const { email } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const user = await getNormalizedUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(404).json({
        message: "No account found for this email.",
      });
    }

    await createAndSendEmailOtp(normalizedEmail);

    return res.status(200).json({
      message: "Password reset OTP sent to email.",
      email: normalizedEmail,
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Invalid request body",
        error: err.errors,
      });
    }

    if (err?.message?.includes("OTP recently sent")) {
      return res.status(429).json({ message: err.message });
    }

    console.error("requestPasswordResetOtp error:", err);
    return res.status(500).json({
      message: "Failed to send reset OTP",
      error: err?.message,
    });
  }
};

// verify reset OTP only
export const verifyPasswordResetOtp = async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      code: z.string().length(6),
    }).strict();

    const { email, code } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const rows = await mysqlQuery<any[]>(
      `
      SELECT *
      FROM email_otps
      WHERE email = ?
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [normalizedEmail]
    );

    if (!rows.length) {
      return res.status(400).json({
        message: "OTP expired or not found. Request a new OTP.",
      });
    }

    const otpRow = rows[0];

    if (sha256(code) !== otpRow.code_hash) {
      return res.status(401).json({ message: "Invalid OTP code." });
    }

    return res.status(200).json({
      message: "OTP verified. You may now reset your password.",
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Invalid request body",
        error: err.errors,
      });
    }

    console.error("verifyPasswordResetOtp error:", err);
    return res.status(500).json({
      message: "OTP verification failed",
      error: err?.message,
    });
  }
};

// reset password after OTP
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const passwordSchema = z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must include at least 1 uppercase letter")
      .regex(/[a-z]/, "Password must include at least 1 lowercase letter")
      .regex(/[0-9]/, "Password must include at least 1 number")
      .regex(/[^A-Za-z0-9]/, "Password must include at least 1 special character");

    const schema = z.object({
      email: z.string().email(),
      code: z.string().length(6),
      newPassword: passwordSchema,
      confirmPassword: z.string().min(1),
    }).strict().superRefine((data, ctx) => {
      if (data.newPassword !== data.confirmPassword) {
        ctx.addIssue({
          code: "custom",
          path: ["confirmPassword"],
          message: "Passwords do not match",
        });
      }
    });

    const { email, code, newPassword } = schema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const auth = await getAuthAccountByEmail(normalizedEmail);
    if (!auth) {
      return res.status(404).json({ message: "Account not found." });
    }

    const rows = await mysqlQuery<any[]>(
      `
      SELECT *
      FROM email_otps
      WHERE email = ?
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
      `,
      [normalizedEmail]
    );

    if (!rows.length) {
      return res.status(400).json({
        message: "OTP expired or not found. Request a new OTP.",
      });
    }

    const otpRow = rows[0];

    if (sha256(code) !== otpRow.code_hash) {
      return res.status(401).json({ message: "Invalid OTP code." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (auth.role === "customer") {
      await mysqlQuery(`UPDATE customer SET password = ? WHERE id = ?`, [
        hashedPassword,
        auth.user_id,
      ]);
    } else if (auth.role === "artist") {
      await mysqlQuery(`UPDATE artist SET password = ? WHERE id = ?`, [
        hashedPassword,
        auth.user_id,
      ]);
    } else if (auth.role === "sessionist") {
      await mysqlQuery(`UPDATE sessionist SET password = ? WHERE id = ?`, [
        hashedPassword,
        auth.user_id,
      ]);
    } else if (auth.role === "organizer") {
      await mysqlQuery(`UPDATE organizer SET password = ? WHERE id = ?`, [
        hashedPassword,
        auth.user_id,
      ]);
    }

    await mysqlQuery(
      `UPDATE email_otps SET consumed_at = NOW() WHERE id = ?`,
      [otpRow.id]
    );

    clearAuthCookie(res);

    return res.status(200).json({
      message: "Password reset successful. You can now log in.",
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Invalid request body",
        error: err.errors,
      });
    }

    console.error("resetPassword error:", err);
    return res.status(500).json({
      message: "Password reset failed",
      error: err?.message,
    });
  }
};
