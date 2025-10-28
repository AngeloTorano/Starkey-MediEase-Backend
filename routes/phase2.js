const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken, requireRole, requireLocationAccess } = require("../middleware/auth")
const Phase2Controller = require("../controllers/phase2Controller")

const router = express.Router()

// All routes require authentication and location access
router.use(authenticateToken)
router.use(requireLocationAccess)

// Phase 2 Registration
router.post(
  "/registration",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase2Registration),
  Phase2Controller.createRegistration,
)
router.get(
  "/registration",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase2Controller.getRegistrations,
)

// Ear Screening
router.post(
  "/ear-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase2EarScreening),
  Phase2Controller.createEarScreening,
)
router.get(
  "/ear-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase2Controller.getEarScreenings,
)

// Hearing Screening
router.post(
  "/hearing-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase2HearingScreening),
  Phase2Controller.createHearingScreening,
)
router.get(
  "/hearing-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase2Controller.getHearingScreenings,
)

// Fitting Table
router.post(
  "/fitting-table",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase2FittingTable),
  Phase2Controller.createFittingTable,
)
router.get(
  "/fitting-table",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase2Controller.getFittingTables,
)

// Fitting
router.post(
  "/fitting",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase2Fitting),
  Phase2Controller.createFitting,
)
router.get(
  "/fitting",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase2Controller.getFittings,
)

// Counseling
router.post(
  "/counseling",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase2Counseling),
  Phase2Controller.createCounseling,
)
router.get(
  "/counseling",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase2Controller.getCounselings,
)

// Final QC
router.post(
  "/final-qc",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase2FinalQC),
  Phase2Controller.createFinalQC,
)
router.get(
  "/final-qc",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase2Controller.getFinalQCs,
)

// Get full Phase 2 data for a patient
router.get("/patient/:patientId", requireRole(["Admin", "City Coordinator", "Country Coordinator"]), Phase2Controller.getPhase2Data)

// Update routes (example)
router.put("/registration/:registrationId", requireRole(["Admin"]), Phase2Controller.updateRegistration)
router.put("/ear-screening/:screeningId", requireRole(["Admin"]), Phase2Controller.updateEarScreening)
router.put("/hearing-screening/:screeningId", requireRole(["Admin"]), Phase2Controller.updateHearingScreening)
router.put("/fitting-table/:fittingTableId", requireRole(["Admin", "City Coordinator", "Country Coordinator"]), Phase2Controller.updateFittingTable)
router.put("/fitting/:fittingId", requireRole(["Admin"]), Phase2Controller.updateFitting)
router.put("/counseling/:counselingId", requireRole(["Admin"]), Phase2Controller.updateCounseling)
router.put("/final-qc/:qcId", requireRole(["Admin"]), Phase2Controller.updateFinalQC)

module.exports = router
