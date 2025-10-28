const express = require("express")
const { authenticateToken, requireRole } = require("../middleware/auth")
const ReportsController = require("../controllers/reportsController")

const router = express.Router()

// All report routes require authentication
router.use(authenticateToken)

router.get("/summary", requireRole(["Admin", "City Coordinator", "Country Coordinator"]), ReportsController.getSummary)
router.get("/demographics", requireRole(["Admin", "City Coordinator", "Country Coordinator"]), ReportsController.getDemographics)
router.get("/medical", requireRole(["Admin", "City Coordinator", "Country Coordinator"]), ReportsController.getMedical)
router.get("/performance", requireRole(["Admin", "City Coordinator", "Country Coordinator"]), ReportsController.getPerformance)
router.get("/patient-geographic",requireRole(["Admin", "City Coordinator", "Country Coordinator"]), ReportsController.getPatientGeographic);

module.exports = router
