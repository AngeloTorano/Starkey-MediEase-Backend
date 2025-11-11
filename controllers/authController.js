const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")
// ADD
const crypto = require("crypto")
const axios = require("axios")

// ADD: lightweight internal SMS helper (duplication kept simple)
const HTTPSMS_BASE_URL = process.env.HTTPSMS_BASE_URL || "https://api.httpsms.com"
const HTTPSMS_API_KEY = process.env.HTTPSMS_API_KEY
const SENDER_NUMBER = process.env.HTTPSMS_SENDER_NUMBER

const formatNumber = (number) => {
  if (!number) return null
  let cleaned = String(number).replace(/\D/g, "")
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1)
  if (!cleaned.startsWith("63")) cleaned = "63" + cleaned
  return "+" + cleaned
}

async function sendSMSSingle(rawNumber, message) {
  if (!HTTPSMS_API_KEY || !SENDER_NUMBER) throw new Error("SMS env vars missing")
  const toNumber = formatNumber(rawNumber)
  if (!toNumber) throw new Error("Invalid phone number")
  await axios.post(
    `${HTTPSMS_BASE_URL}/v1/messages/send`,
    { content: message, from: SENDER_NUMBER, to: toNumber },
    { headers: { "x-api-key": HTTPSMS_API_KEY, Accept: "application/json", "Content-Type": "application/json" } }
  )
}

class AuthController {
  static async login(req, res) {
    try {
      const { username, password } = req.body

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

      // Generate OTP instead of issuing final token
      const otp_code = crypto.randomInt(100000, 999999).toString()
      const expires_at = new Date(Date.now() + 5 * 60 * 1000)

      await db.query(
        "INSERT INTO otp_codes (user_id, otp_code, expires_at) VALUES ($1,$2,$3)",
        [user.user_id, otp_code, expires_at]
      )

      // Send OTP SMS (silently ignore send failure -> user can request resend)
      try {
        if (user.phone_number) {
          await sendSMSSingle(user.phone_number, `Your MediEase login OTP is ${otp_code}. Valid 5 minutes.`)
          await db.query(
            "INSERT INTO sms_messages (message_type, message_content, recipient_count, recipients) VALUES ($1,$2,$3,$4)",
            ["OTP", `OTP for user ${user.user_id}`, 1, user.phone_number]
          )
        }
      } catch (e) {
        console.error("OTP SMS send failed:", e.message)
      }

      // Audit login attempt (password passed; OTP pending)
      await db.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5)",
        ["users", user.user_id, "LOGIN_INIT", JSON.stringify({ at: new Date().toISOString() }), user.user_id]
      )

      return res.status(200).json({
        success: true,
        message: "OTP sent. Complete verification.",
        data: {
          otp_required: true,
          user: {
            user_id: user.user_id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            roles: user.roles.filter(r => r !== null),
            phone_number: user.phone_number
          }
        }
      })
    } catch (error) {
      console.error("Login error:", error)
      return ResponseHandler.error(res, "Login failed")
    }
  }

  // NEW: Verify OTP and issue final JWT
  static async verifyOtp(req, res) {
    try {
      const { user_id, otp_code } = req.body
      if (!user_id || !otp_code) return ResponseHandler.badRequest(res, "user_id and otp_code required")

      const { rows } = await db.query(
        "SELECT * FROM otp_codes WHERE user_id = $1 AND otp_code = $2 AND is_verified = false",
        [user_id, otp_code]
      )
      if (!rows.length) return ResponseHandler.unauthorized(res, "Invalid OTP")

      const otp = rows[0]
      if (new Date() > new Date(otp.expires_at)) {
        return ResponseHandler.unauthorized(res, "OTP expired")
      }

      await db.query("UPDATE otp_codes SET is_verified = true WHERE otp_id = $1", [otp.otp_id])

      // Fetch user for token
      const userQuery = `
        SELECT u.*, array_agg(r.role_name) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.user_id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.role_id
        WHERE u.user_id = $1 AND u.is_active = true
        GROUP BY u.user_id
      `
      const userRes = await db.query(userQuery, [user_id])
      if (!userRes.rows.length) return ResponseHandler.unauthorized(res, "User inactive")

      const user = userRes.rows[0]
      const token = jwt.sign(
        { userId: user.user_id, username: user.username, roles: user.roles.filter(r => r !== null) },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
      )

      await db.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5)",
        ["users", user.user_id, "LOGIN_SUCCESS", JSON.stringify({ at: new Date().toISOString() }), user.user_id]
      )

      return res.status(200).json({
        success: true,
        message: "OTP verified. Login successful.",
        data: {
          token,
          user: {
            user_id: user.user_id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            roles: user.roles.filter(r => r !== null),
            phone_number: user.phone_number
          }
        }
      })
    } catch (error) {
      console.error("Verify OTP error:", error)
      return ResponseHandler.error(res, "OTP verification failed")
    }
  }

  // NEW: Forgot password init (send OTP)
  static async forgotPasswordInit(req, res) {
    try {
      const { username } = req.body
      if (!username) return ResponseHandler.badRequest(res, "Username required")

      const { rows } = await db.query(
        "SELECT user_id, phone_number, is_active FROM users WHERE username = $1",
        [username]
      )
      if (!rows.length) return ResponseHandler.notFound(res, "User not found")
      const user = rows[0]
      if (!user.is_active) return ResponseHandler.unauthorized(res, "User inactive")
      if (!user.phone_number) return ResponseHandler.badRequest(res, "No phone number on record")

      const otp_code = crypto.randomInt(100000, 999999).toString()
      const expires_at = new Date(Date.now() + 5 * 60 * 1000)

      await db.query(
        "INSERT INTO otp_codes (user_id, otp_code, expires_at) VALUES ($1,$2,$3)",
        [user.user_id, otp_code, expires_at]
      )

      try {
        await sendSMSSingle(user.phone_number, `Your password reset OTP is ${otp_code}. Valid 5 minutes.`)
        await db.query(
          "INSERT INTO sms_messages (message_type, message_content, recipient_count, recipients) VALUES ($1,$2,$3,$4)",
          ["OTP", `Password reset OTP for user ${user.user_id}`, 1, user.phone_number]
        )
      } catch (e) {
        console.error("Forgot password SMS failed:", e.message)
      }

      return ResponseHandler.success(res, null, "OTP sent")
    } catch (error) {
      console.error("Forgot password init error:", error)
      return ResponseHandler.error(res, "Failed to send OTP")
    }
  }

  // NEW: Forgot password reset (verify OTP + set new password)
  static async forgotPasswordReset(req, res) {
    try {
      const { username, otp_code, new_password } = req.body
      if (!username || !otp_code || !new_password) {
        return ResponseHandler.badRequest(res, "username, otp_code, new_password required")
      }
      if (String(new_password).length < 6) {
        return ResponseHandler.badRequest(res, "Password must be at least 6 characters")
      }

      const { rows: users } = await db.query("SELECT user_id, password_hash FROM users WHERE username = $1", [username])
      if (!users.length) return ResponseHandler.notFound(res, "User not found")
      const user_id = users[0].user_id

      const { rows: otpRows } = await db.query(
        "SELECT * FROM otp_codes WHERE user_id = $1 AND otp_code = $2 AND is_verified = false",
        [user_id, otp_code]
      )
      if (!otpRows.length) return ResponseHandler.unauthorized(res, "Invalid OTP")
      const otp = otpRows[0]
      if (new Date() > new Date(otp.expires_at)) {
        return ResponseHandler.unauthorized(res, "OTP expired")
      }

      await db.query("UPDATE otp_codes SET is_verified = true WHERE otp_id = $1", [otp.otp_id])

      const newHash = await bcrypt.hash(new_password, 10)
      await db.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2", [newHash, user_id])

      await db.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5)",
        ["users", user_id, "PASSWORD_RESET", JSON.stringify({ at: new Date().toISOString() }), user_id]
      )

      return ResponseHandler.success(res, null, "Password reset successful")
    } catch (error) {
      console.error("Forgot password reset error:", error)
      return ResponseHandler.error(res, "Reset failed")
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

  // ADD: Change password
  static async changePassword(req, res) {
    try {
      const userId = req.user?.user_id
      const { old_password, new_password } = req.body || {}

      if (!userId) {
        return ResponseHandler.unauthorized(res, "Unauthorized")
      }
      if (!old_password || !new_password) {
        return ResponseHandler.badRequest(res, "Old and new password are required")
      }
      if (String(new_password).length < 6) {
        return ResponseHandler.badRequest(res, "New password must be at least 6 characters")
      }

      // Get current password hash
      const userQuery = "SELECT password_hash FROM users WHERE user_id = $1 AND is_active = true"
      const result = await db.query(userQuery, [userId])
      if (result.rows.length === 0) {
        return ResponseHandler.unauthorized(res, "Unauthorized")
      }

      const password_hash = result.rows[0].password_hash
      const isOldPasswordValid = await bcrypt.compare(old_password, password_hash)
      if (!isOldPasswordValid) {
        return ResponseHandler.unauthorized(res, "Invalid old password")
      }

      // Update password
      const newHash = await bcrypt.hash(new_password, 10)
      await db.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2", [newHash, userId])

      await db.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5)",
        ["users", userId, "PASSWORD_CHANGE", JSON.stringify({ at: new Date().toISOString() }), userId]
      )

      return ResponseHandler.success(res, null, "Password changed successfully")
    } catch (error) {
      console.error("Change password error:", error)
      return ResponseHandler.error(res, "Password change failed")
    }
  }
}

module.exports = AuthController
