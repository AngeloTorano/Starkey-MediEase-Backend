const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken, requireRole, requireLocationAccess } = require("../middleware/auth")
const Phase1Controller = require("../controllers/phase1Controller")

const router = express.Router()

// All routes require authentication and location access
router.use(authenticateToken)
router.use(requireLocationAccess)

// Phase 1 Registration Section
router.post(
  "/registration",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase1Registration),
  Phase1Controller.createRegistration,
)

router.get(
  "/registration",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.getRegistrations,
)

// Ear Screening
router.post(
  "/ear-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.earScreening),
  Phase1Controller.createEarScreening,
)

router.get(
  "/ear-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.getEarScreenings,
)

// Hearing Screening
router.post(
  "/hearing-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.hearingScreening),
  Phase1Controller.createHearingScreening,
)

router.get(
  "/hearing-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.getHearingScreenings,
)

// Ear Impressions
router.post(
  "/ear-impressions",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.earImpression),
  Phase1Controller.createEarImpression,
)

router.get(
  "/ear-impressions",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.getEarImpressions,
)

// Final QC Phase 1
router.post(
  "/final-qc",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.finalQCP1),
  Phase1Controller.createFinalQC,
)

router.get(
  "/final-qc",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.getFinalQCs,
)

// Get complete Phase 1 data for a patient
router.get(
  "/patient/:patientId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.getPhase1Data,
)

// Update Phase 1 records
router.put(
  "/registration/:registrationId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.updateRegistration,
)

router.put(
  "/ear-screening/:screeningId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.updateEarScreening,
)

router.put(
  "/hearing-screening/:screeningId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.updateHearingScreening,
)

router.put(
  "/ear-impressions/:impressionId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.updateEarImpression,
)

router.put(
  "/final-qc/:qcId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase1Controller.updateFinalQC,
)

module.exports = router
