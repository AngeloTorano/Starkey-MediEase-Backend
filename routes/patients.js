const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken, requireRole, requireLocationAccess } = require("../middleware/auth")
const PatientController = require("../controllers/patientController")

const router = express.Router()

// All routes require authentication and location access
router.use(authenticateToken)
router.use(requireLocationAccess)

router.get(
  "/shf",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  PatientController.findPatientIdByShf
);

router.post(
  "/",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  validateRequest(schemas.createPatient),
  PatientController.createPatient,
)

router.get("/", requireRole(["Admin", "City Coordinator", "Country Coordinator"]), PatientController.getPatients)

router.get(
  "/phase/:phaseId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  PatientController.getPatientsByPhase,
)

// NEW: full cross-phase report for a patient (keep before the generic :patientId route)
router.get(
  "/:patientId/full",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  PatientController.getPatientFullReport,
)

// Existing specific-id route
router.get(
  "/:patientId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  PatientController.getPatientById,
)

router.put(
  "/:patientId",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  PatientController.updatePatient,
)

router.post(
  "/:patientId/advance-phase",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  PatientController.advancePatientPhase,
)

module.exports = router
