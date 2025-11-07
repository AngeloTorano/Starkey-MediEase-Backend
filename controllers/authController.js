const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

class AuthController {
  static async login(req, res) {
    try {
      const { username, password } = req.body

      // Get user with roles
      const userQuery = `
        SELECT u.*, array_agg(r.role_name) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.user_id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.role_id
        WHERE u.username = $1 AND u.is_active = true
        GROUP BY u.user_id
      `

      const result = await db.query(userQuery, [username])

      if (result.rows.length === 0) {
        return ResponseHandler.unauthorized(res, "Invalid credentials")
      }

      const user = result.rows[0]
      const isValidPassword = await bcrypt.compare(password, user.password_hash)

      if (!isValidPassword) {
        return ResponseHandler.unauthorized(res, "Invalid credentials")
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.user_id,
          username: user.username,
          roles: user.roles.filter((role) => role !== null),
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "24h" },
      )

      // Log successful login
      await db.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["users", user.user_id, "LOGIN", JSON.stringify({ login_time: new Date() }), user.user_id],
      )

    const responseData = {
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        roles: user.roles.filter((role) => role !== null),
        phone_number: user.phone_number, // ADD THIS
        // city_assigned: user.city_assigned, // optional
      },
    };

    return res.status(200).json({
  success: true,
  message: "Login successful",
  timestamp: new Date().toISOString(),
  data: responseData,
});


    } catch (error) {
      console.error("Login error:", error)
      return ResponseHandler.error(res, "Login failed")
    }
  }

  static async refreshToken(req, res) {
    try {
      const { user } = req

      const token = jwt.sign(
        {
          userId: user.user_id,
          username: user.username,
          roles: user.roles,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "24h" },
      )

      return ResponseHandler.success(res, { token }, "Token refreshed")
    } catch (error) {
      console.error("Token refresh error:", error)
      return ResponseHandler.error(res, "Token refresh failed")
    }
  }

  static async logout(req, res) {
    try {
      const { user } = req

      // Log logout
      await db.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["users", user.user_id, "LOGOUT", JSON.stringify({ logout_time: new Date() }), user.user_id],
      )

      return ResponseHandler.success(res, null, "Logout successful")
    } catch (error) {
      console.error("Logout error:", error)
      return ResponseHandler.error(res, "Logout failed")
    }
  }
}

module.exports = AuthController
