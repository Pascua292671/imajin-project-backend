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
  resetPassword,
  verifyPasswordResetOtp,
  requestPasswordResetOtp
} from "../Controller/UserController";
import { requireAuth } from "../middleware/auth.middleware";

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

// LOGIN
router.post("/login", loginUser);

// USERNAME CHECKER
router.get("/username-available", checkUsernameAvailability);

// OTP
router.post("/otp/request", requestEmailOtp);
router.post("/otp/verify", verifyEmailOtp);

// GOOGLE ID TOKEN FLOW
router.post("/google", googleAuth);

// GOOGLE PASSPORT REDIRECT FLOW
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: true,
    prompt:"select_account",
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: true,
  }),
  googlePassportCallback
);

// CURRENT USER
router.get("/me", requireAuth, me);

// LOGOUT
router.post("/logout", logoutUser);
router.post("/forgot-password/request", requestPasswordResetOtp);
router.post("/forgot-password/verify", verifyPasswordResetOtp);
router.post("/forgot-password/reset", resetPassword);
export default router;