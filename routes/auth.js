const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken } = require("../middleware/auth")
const AuthController = require("../controllers/authController")

const router = express.Router()

// Public routes
router.post("/login", validateRequest(schemas.login), AuthController.login)
// NEW: OTP verify (public after successful password)
router.post("/verify-otp", AuthController.verifyOtp)
// NEW: Forgot password flow
router.post("/forgot-password/init", AuthController.forgotPasswordInit)
router.post("/forgot-password/reset", AuthController.forgotPasswordReset)

// Protected routes
router.post("/refresh", authenticateToken, AuthController.refreshToken)
router.post("/logout", authenticateToken, AuthController.logout)
router.post(
  "/change-password",
  authenticateToken,
  validateRequest(schemas.changePassword),
  AuthController.changePassword
)

module.exports = router
