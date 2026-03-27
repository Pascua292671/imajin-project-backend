import "./databes/config/env";
import "./databes/config/passport";

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import cookieParser from "cookie-parser";

import publicProfileRoutes from "./Routes/publicProfile.route";
import eventRoutes from "./Routes/event.router";
import mirrorRoutes from "./Routes/mirror.route";
import discoverRoutes from "./Routes/discover.route";
import invitationRoutes from "./Routes/invitation.router";
import authRoutes from "./Routes/auth.routes";
import profileroutes from "./Routes/profile.routes";
import bookingRoutes from "./Routes/booking.routes";
import ticketOrderRoutes from "./Routes/ticketOrder.routes";
import ticketTierRoutes from "./Routes/ticketTier.routes"





console.log("ENV LOADED:", {
  hasJwt: !!process.env.JWT_SECRET,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT,
  smtpUserSet: !!process.env.SMTP_USER,
  smtpPassSet: !!process.env.SMTP_PASS,
  googleClientLoaded: !!process.env.GOOGLE_CLIENT_ID,
});

console.log("GOOGLE_CLIENT_ID used:", process.env.GOOGLE_CLIENT_ID);

const app = express();

const FRONTEND_ORIGIN = "http://localhost:3000";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors({ origin: FRONTEND_ORIGIN, credentials: true }));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, message: "API is running" });
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

//booking
app.use("/api/bookings", bookingRoutes);
app.use("/api/ticket-orders", ticketOrderRoutes);
app.use("/api/ticket-tiers",ticketTierRoutes);



app.use(passport.initialize());
app.use(passport.session());
app.use("/api/auth", authRoutes);

app.use ("/api/profile", profileroutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/mirror", mirrorRoutes);
app.use("/api", eventRoutes);
app.use("/api/public", publicProfileRoutes);
app.use("/api/discover", discoverRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "ROUTE_NOT_FOUND",
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});