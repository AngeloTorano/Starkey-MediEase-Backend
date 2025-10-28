const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken, requireRole } = require("../middleware/auth")
const UserController = require("../controllers/userController")

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// Admin only routes
router.post("/", requireRole(["Admin"]), validateRequest(schemas.createUser), UserController.createUser)
router.get("/", requireRole(["Admin"]), UserController.getUsers)
router.get("/roles", requireRole(["Admin"]), UserController.getRoles)
router.get("/:userId", requireRole(["Admin"]), UserController.getUserById)
router.put("/:userId", requireRole(["Admin"]), UserController.updateUser)
router.put("/:userId/roles", requireRole(["Admin"]), UserController.updateUserRoles)
router.delete("/:userId/deactive", requireRole(["Admin"]), UserController.deactivateUser)

module.exports = router
