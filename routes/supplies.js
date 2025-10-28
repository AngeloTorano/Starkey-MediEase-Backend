const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken, requireRole } = require("../middleware/auth")
const SupplyController = require("../controllers/supplyController")

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// Supply categories
router.get("/categories", requireRole(["Admin", "Supply Manager"]), SupplyController.getSupplyCategories)
router.post(
  "/categories",
  requireRole(["Admin", "Supply Manager"]),
  validateRequest(schemas.createSupplyCategory),
  SupplyController.createSupplyCategory,
)

// Transaction types
router.get("/transaction-types", requireRole(["Admin", "Supply Manager"]), SupplyController.getTransactionTypes)

// Supply management
router.post(
  "/",
  requireRole(["Admin", "Supply Manager"]),
  validateRequest(schemas.createSupply),
  SupplyController.createSupply,
)

router.get("/", requireRole(["Admin", "Supply Manager"]), SupplyController.getSupplies)

router.put(
  "/:supplyId/stock",
  requireRole(["Admin", "Supply Manager"]),
  validateRequest(schemas.updateStock),
  SupplyController.updateStock,
)

router.get("/:supplyId/transactions", requireRole(["Admin", "Supply Manager"]), SupplyController.getSupplyTransactions)

router.get("/:supplyId", requireRole(["Admin", "Supply Manager"]), SupplyController.getSupplyById)

router.put("/:supplyId", requireRole(["Admin", "Supply Manager"]), SupplyController.updateSupply)

router.delete("/:supplyId", requireRole(["Admin", "Supply Manager"]), SupplyController.deleteSupply)

module.exports = router
