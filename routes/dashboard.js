const express = require("express");
const { authenticateToken, requireRole } = require("../middleware/auth");
const DashboardController = require("../controllers/dashboardController");

const router = express.Router();

// All report routes require authentication
router.use(authenticateToken);

const allowedRoles = ["Admin", "City Coordinator", "Country Coordinator"];

// Comprehensive dashboard (aggregates multiple analytics)
router.get(
  "/comprehensive",
  requireRole(allowedRoles),
  DashboardController.getComprehensiveDashboard
);

// Enhanced summary
router.get(
  "/enhanced-summary",
  requireRole(allowedRoles),
  DashboardController.getEnhancedSummary
);

// KPI metrics (route handler version)
router.get(
  "/kpi-metrics",
  requireRole(allowedRoles),
  DashboardController.getKPIMetrics
);

// Demographic analytics
router.get(
  "/demographics",
  requireRole(allowedRoles),
  DashboardController.getDemographicAnalytics
);

// Medical analytics
router.get(
  "/medical-analytics",
  requireRole(allowedRoles),
  DashboardController.getMedicalAnalytics
);

// Geographic analytics
router.get(
  "/geographic-analytics",
  requireRole(allowedRoles),
  DashboardController.getGeographicAnalytics
);

// Performance analytics
router.get(
  "/performance-analytics",
  requireRole(allowedRoles),
  DashboardController.getPerformanceAnalytics
);

// Phase progress analytics
router.get(
  "/phase-progress",
  requireRole(allowedRoles),
  DashboardController.getPhaseProgressAnalytics
);

// Time series analytics
router.get(
  "/time-series",
  requireRole(allowedRoles),
  DashboardController.getTimeSeriesAnalytics
);

// Filter options for dropdowns
router.get(
  "/filters/options",
  requireRole(allowedRoles),
  DashboardController.getFilterOptions
);

// Summary (alias for enhanced summary or KPI as needed)
router.get(
  "/summary",
  requireRole(allowedRoles),
  DashboardController.getEnhancedSummary
);

// --- UPDATED & NEW ROUTES ---

// Patient geographic (map-friendly, alias)
router.get(
  "/patient-geographic",
  requireRole(allowedRoles),
  DashboardController.getGeographicAnalytics
);

// NEW: Patient city distribution (for the map page)
router.get(
  "/patient-city-distribution",
  requireRole(allowedRoles),
  DashboardController.getPatientCityDistribution
);

module.exports = router;