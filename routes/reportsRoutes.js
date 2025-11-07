const express = require("express")
const { authenticateToken } = require("../middleware/auth")
const ReportingController = require("../controllers/reportsController")

const router = express.Router()

router.use(authenticateToken)

// Export-only endpoints
router.get("/export/phase1", ReportingController.exportPhase1)
router.get("/export/phase2", ReportingController.exportPhase2)
router.get("/export/phase3", ReportingController.exportPhase3)
router.get("/export/all", ReportingController.exportAllPhases)

module.exports = router