const jwt = require("jsonwebtoken")
const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1]

    if (!token) {
      return ResponseHandler.unauthorized(res, "Access token required")
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Verify user still exists and is active
    const userQuery = `
      SELECT u.*, array_agg(r.role_name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id
      WHERE u.user_id = $1 AND u.is_active = true
      GROUP BY u.user_id
    `

    const result = await db.query(userQuery, [decoded.userId])

    if (result.rows.length === 0) {
      return ResponseHandler.unauthorized(res, "Invalid or expired token")
    }

    req.user = {
      ...result.rows[0],
      roles: result.rows[0].roles.filter((role) => role !== null),
    }

    next()
  } catch (error) {
    console.error("Authentication error:", error)
    return ResponseHandler.unauthorized(res, "Invalid token")
  }
}

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ResponseHandler.unauthorized(res)
    }

    const userRoles = req.user.roles || []
    const hasRequiredRole = roles.some((role) => userRoles.includes(role))

    if (!hasRequiredRole) {
      return ResponseHandler.forbidden(res, "Insufficient permissions")
    }

    next()
  }
}

const requireLocationAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return ResponseHandler.unauthorized(res)
    }

    // Admin has access to everything
    if (req.user.roles.includes("admin")) {
      return next()
    }

    // Get user's location assignments
    const locationQuery = `
      SELECT ul.country_id, ul.city_id, c.country_name, ci.city_name
      FROM user_locations ul
      LEFT JOIN countries c ON ul.country_id = c.country_id
      LEFT JOIN cities ci ON ul.city_id = ci.city_id
      WHERE ul.user_id = $1
    `

    const result = await db.query(locationQuery, [req.user.user_id])
    req.user.locations = result.rows

    next()
  } catch (error) {
    console.error("Location access error:", error)
    return ResponseHandler.error(res, "Error checking location access")
  }
}

module.exports = {
  authenticateToken,
  requireRole,
  requireLocationAccess,
}
