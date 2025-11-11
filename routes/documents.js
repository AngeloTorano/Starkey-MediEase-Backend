const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken, requireRole } = require("../middleware/auth")
const DocumentController = require("../controllers/documentController")
const { upload, multerErrorHandler } = require("../middleware/uploadMiddleware")

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// Get all documents
router.get(
  "/",
  requireRole(["Admin", "Country Coordinator", "City Coordinator"]),
  (req, res, next) => {
    next()
  },
  DocumentController.getAllDocuments
)

// Upload new document - UPDATED ORDER
router.post(
  "/upload",
  requireRole(["Admin"]),
  (req, res, next) => {
    next()
  },
  // Multer middleware MUST be before any body parsing
  upload.single('document'),
  multerErrorHandler,
  (req, res, next) => {
    next()
  },
  validateRequest(schemas.uploadDocument),
  DocumentController.uploadDocument
)

// Download document
router.get(
  "/download/:id",
  requireRole(["Admin", "Country Coordinator", "City Coordinator"]),
  (req, res, next) => {
    next()
  },
  DocumentController.downloadDocument
)

// Delete document
router.delete(
  "/:id",
  requireRole(["Admin"]),
  (req, res, next) => {
    next()
  },
  DocumentController.deleteDocument
)

module.exports = router