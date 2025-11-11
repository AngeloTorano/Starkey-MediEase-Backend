const express = require("express");
const ArchivalController = require("../controllers/archivalController");
const { authenticateToken, requireRole, requireLocationAccess } = require("../middleware/auth");

const router = express.Router();

// require auth + location access
router.use(authenticateToken);
router.use(requireLocationAccess);

// NOTE: removed POST /:patientId/archive route (archival is now managed server-side)
// keep per-patient archive listing
router.get(
  "/:patientId",
  requireRole(["Admin", "Country Coordinator", "City Coordinator"]),
  ArchivalController.getArchives
);

// list archived patients (GET /api/archival)
router.get(
  "/",
  requireRole(["Admin", "Country Coordinator", "City Coordinator"]),
  ArchivalController.getArchivedPatients
);

// unarchive a patient (POST /api/archival/:patientId/unarchive)
router.post(
  "/:patientId/unarchive",
  requireRole(["Admin", "Country Coordinator", "City Coordinator"]),
  ArchivalController.unarchivePatient
);

// manual archive (restore user action)
router.post(
  "/:patientId/archive",
  requireRole(["Admin", "Country Coordinator", "City Coordinator"]),
  ArchivalController.manualArchivePatient
);

// run-auto kept (Admin)
router.post(
  "/run-auto",
  requireRole(["Admin"]),
  ArchivalController.archiveEligiblePatients
);

// background runner unchanged
const AUTO_ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
setInterval(async () => {
  try {
    await ArchivalController.archiveEligiblePatients({ user: { user_id: null } }, null);
  } catch (err) {
    console.error("Auto-archive run failed:", err);
  }
}, AUTO_ARCHIVE_INTERVAL_MS);

module.exports = router;