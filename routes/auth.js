const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken } = require("../middleware/auth")
const AuthController = require("../controllers/authController")

const router = express.Router()

// Public routes
router.post("/login", validateRequest(schemas.login), AuthController.login)

// Protected routes
router.post("/refresh", authenticateToken, AuthController.refreshToken)
router.post("/logout", authenticateToken, AuthController.logout)

module.exports = router
