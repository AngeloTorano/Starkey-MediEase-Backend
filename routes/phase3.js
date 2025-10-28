const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken, requireRole, requireLocationAccess } = require("../middleware/auth")
const Phase3Controller = require("../controllers/phase3Controller")

const router = express.Router()

// All routes require authentication and location access
router.use(authenticateToken)
router.use(requireLocationAccess)

// Phase 3 Registration Section
router.post(
  "/registration",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.phase3Registration),
  Phase3Controller.createRegistration,
)

router.get(
  "/registration",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.getRegistrations,
)

// Ear Screening
router.post(
  "/ear-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.earScreening),
  Phase3Controller.createEarScreening,
)

router.get(
  "/ear-screening",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.getEarScreenings,
)

// Aftercare Assessment
router.post(
  "/aftercare-assessment",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.aftercareAssessment),
  Phase3Controller.createAftercareAssessment,
)

router.get(
  "/aftercare-assessment",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.getAftercareAssessments,
)

// Final QC Phase 3
router.post(
  "/final-qc",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.finalQCP3),
  Phase3Controller.createFinalQC,
)

router.get(
  "/final-qc",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.getFinalQCs,
)

// Get complete Phase 3 data for a patient
router.get(
  "/patient/:patientId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.getPhase3Data,
)

// Update Phase 3 records
router.put(
  "/registration/:registrationId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.updateRegistration,
)

router.put(
  "/ear-screening/:screeningId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.updateEarScreening,
)

router.put(
  "/aftercare-assessment/:assessmentId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.updateAftercareAssessment,
)

router.put(
  "/final-qc/:qcId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  Phase3Controller.updateFinalQC,
)

module.exports = router
