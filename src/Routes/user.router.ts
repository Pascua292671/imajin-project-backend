import { Router } from "express";
import passport from "passport";
import {
  registerUser,
  loginUser,
  requestEmailOtp,
  verifyEmailOtp,
  googleAuth,
  logoutUser,
  checkUsernameAvailability,
  me,
  googlePassportCallback,
} from "../Controller/UserController";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

// REGISTER
router.post(
  "/register",
  (req, _res, next) => {
    console.log("[REGISTER] incoming:", req.body);
    next();
  },
  registerUser
);

// GOOGLE PASSPORT REDIRECT FLOW
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: true,
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: true,
  }),
  googlePassportCallback
);

// SESSION / CURRENT USER
router.get("/me", requireAuth, me);

// LOGIN
router.post("/login", loginUser);

// USERNAME CHECKER
router.get("/username-available", checkUsernameAvailability);

// OTP
router.post("/otp/request", requestEmailOtp);
router.post("/otp/verify", verifyEmailOtp);

// GOOGLE ID TOKEN FLOW
router.post("/google", googleAuth);

// LOGOUT
router.post("/logout", logoutUser);

export default router;