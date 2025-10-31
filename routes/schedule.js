const express = require("express")
const { authenticateToken, requireRole } = require("../middleware/auth")
const ScheduleController = require("../controllers/scheduleController")

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// 🔹 Admin-only routes
router.post("/", requireRole(["Admin"]), ScheduleController.createSchedule)
router.put("/:scheduleId", requireRole(["Admin"]), ScheduleController.updateSchedule)
router.delete("/:scheduleId", requireRole(["Admin"]), ScheduleController.deleteSchedule)

// 🔹 Public/Shared routes
router.get("/", ScheduleController.getSchedules)
router.get("/:scheduleId", ScheduleController.getScheduleById)

module.exports = router
