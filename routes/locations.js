const express = require("express")
const { validateRequest, schemas } = require("../middleware/validation")
const { authenticateToken, requireRole } = require("../middleware/auth")
const LocationController = require("../controllers/locationController")

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// Countries
router.get("/countries", LocationController.getCountries)
router.post(
  "/countries",
  requireRole(["Admin"]),
  validateRequest(schemas.createCountry),
  LocationController.createCountry,
)
router.put("/countries/:countryId", requireRole(["Admin"]), LocationController.updateCountry)
router.delete("/countries/:countryId", requireRole(["Admin"]), LocationController.deleteCountry)

// Cities
router.get("/cities", LocationController.getCities)
router.post("/cities", requireRole(["Admin"]), validateRequest(schemas.createCity), LocationController.createCity)
router.put("/cities/:cityId", requireRole(["Admin"]), LocationController.updateCity)
router.delete("/cities/:cityId", requireRole(["Admin"]), LocationController.deleteCity)

// User Locations
router.get("/user-locations", requireRole(["Admin"]), LocationController.getUserLocations)
router.post(
  "/user-locations",
  requireRole(["Admin"]),
  validateRequest(schemas.assignUserLocation),
  LocationController.assignUserLocation,
)
router.delete("/user-locations/:userLocationId", requireRole(["Admin"]), LocationController.removeUserLocation)

module.exports = router
