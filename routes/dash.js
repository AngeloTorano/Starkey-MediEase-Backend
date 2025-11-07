const express = require("express");
const router = express.Router();
const DashController = require("../controllers/dash");
const authMiddleware = require("../middleware/auth");

router.get(
  "/dash",
  authMiddleware.authenticateToken, // ✅ correct function name
  DashController.getDashboardData
);

router.get(
    "/regions",
    authMiddleware.authenticateToken,
    DashController.getRegionList
)

module.exports = router;
