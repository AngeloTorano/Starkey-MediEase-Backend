const bcrypt = require("bcryptjs")
const { nanoid } = require("nanoid")
const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

class UserController {
  static async createUser(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const {
        username,
        password,
        first_name,
        last_name,
        email,
        roles,
        city_assigned,
        phone_number,
      } = req.body

      // Check if username or email already exists
      const existingUser = await client.query("SELECT user_id FROM users WHERE username = $1 OR email = $2", [
        username,
        email,
      ])

      if (existingUser.rows.length > 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Username or email already exists", 400)
      }

      // Hash password
      const saltRounds = 12
      const password_hash = await bcrypt.hash(password, saltRounds)

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (username, password_hash, first_name, last_name, email, city_assigned, phone_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id`,
        [username, password_hash, first_name, last_name, email || null, city_assigned || null, phone_number],
      )

      const userId = userResult.rows[0].user_id

      // Assign roles
      for (const roleName of roles) {
        const roleResult = await client.query("SELECT role_id FROM roles WHERE role_name = $1", [roleName])

        if (roleResult.rows.length > 0) {
          await client.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [
            userId,
            roleResult.rows[0].role_id,
          ])
        }
      }

      // --- ⭐️ START: FIX ⭐️ ---
      // Safely get the user ID for logging
      const changed_by_user_id = req.user?.user_id || null
      // --- ⭐️ END: FIX ⭐️ ---

      // Log user creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["users", userId, "CREATE", JSON.stringify({ username, roles }), changed_by_user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, { user_id: userId }, "User created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create user error:", error)
      return ResponseHandler.error(res, "Failed to create user")
    } finally {
      client.release()
    }
  }

  static async getUsers(req, res) {
    try {
      const { page = 1, limit = 10, role, active } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT u.user_id, u.username, u.first_name, u.last_name, u.email, u.phone_number,u.city_assigned, 
               u.is_active, u.created_at, array_agg(r.role_name) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.user_id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.role_id
      `

      const conditions = []
      const params = []

      if (role) {
        conditions.push(`r.role_name = $${params.length + 1}`)
        params.push(role)
      }

      if (active !== undefined) {
        conditions.push(`u.is_active = $${params.length + 1}`)
        params.push(active === "true")
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` GROUP BY u.user_id ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await db.query(query, params)

      const users = result.rows.map((user) => ({
        ...user,
        roles: user.roles.filter((role) => role !== null),
      }))

      return ResponseHandler.success(res, users, "Users retrieved successfully")
    } catch (error) {
      console.error("Get users error:", error)
      return ResponseHandler.error(res, "Failed to retrieve users")
    }
  }

  static async updateUserRoles(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { userId } = req.params
      const { roles } = req.body

      // Remove existing roles
      await client.query("DELETE FROM user_roles WHERE user_id = $1", [userId])

      // Add new roles
      for (const roleName of roles) {
        const roleResult = await client.query("SELECT role_id FROM roles WHERE role_name = $1", [roleName])

        if (roleResult.rows.length > 0) {
          await client.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [
            userId,
            roleResult.rows[0].role_id,
          ])
        }
      }

      // --- ⭐️ START: FIX ⭐️ ---
      // Safely get the user ID for logging
      const changed_by_user_id = req.user?.user_id || null
      // --- ⭐️ END: FIX ⭐️ ---

      // Log role update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["user_roles", userId, "UPDATE", JSON.stringify({ roles }), changed_by_user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, null, "User roles updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update user roles error:", error)
      return ResponseHandler.error(res, "Failed to update user roles")
    } finally {
      client.release()
    }
  }

  static async getUserById(req, res) {
    try {
      const { userId } = req.params

      const query = `
        SELECT u.user_id, u.username, u.first_name, u.last_name, u.email, 
               u.is_active, u.created_at, u.updated_at, array_agg(r.role_name) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.user_id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.role_id
        WHERE u.user_id = $1
        GROUP BY u.user_id
      `

      const result = await db.query(query, [userId])

      if (result.rows.length === 0) {
        return ResponseHandler.notFound(res, "User not found")
      }

      const user = {
        ...result.rows[0],
        roles: result.rows[0].roles.filter((role) => role !== null),
      }

      return ResponseHandler.success(res, user, "User retrieved successfully")
    } catch (error) {
      console.error("Get user error:", error)
      return ResponseHandler.error(res, "Failed to retrieve user")
    }
  }

  static async updateUser(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { userId } = req.params
      const rawBody = req.body

      // Extract roles separately
      const rolesToSet = Array.isArray(rawBody.roles) ? rawBody.roles : null

      // Clone and sanitize update data
      const updateData = { ...rawBody }
      delete updateData.password
      delete updateData.password_hash
      delete updateData.roles // prevent invalid column usage

      // Whitelist allowed user columns
      const allowedCols = [
        "username",
        "first_name",
        "last_name",
        "email",
        "city_assigned",
        "phone_number",
        "is_active"
      ]
      const updateFields = allowedCols.filter(f => Object.prototype.hasOwnProperty.call(updateData, f))

      // Get current user
      const currentResult = await client.query("SELECT * FROM users WHERE user_id = $1", [userId])
      if (currentResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "User not found")
      }
      const currentData = currentResult.rows[0]

      let updatedUserRow = currentData

      if (updateFields.length > 0) {
        const setClause = updateFields.map((f, i) => `${f} = $${i + 2}`).join(", ")
        const values = [userId, ...updateFields.map(f => updateData[f])]
        const updateQuery = `
          UPDATE users
          SET ${setClause}, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1
          RETURNING *
        `
        const result = await client.query(updateQuery, values)
        updatedUserRow = result.rows[0]
      }

      // Handle roles change if provided
      if (rolesToSet) {
        await client.query("DELETE FROM user_roles WHERE user_id = $1", [userId])
        for (const roleName of rolesToSet) {
          const roleRes = await client.query("SELECT role_id FROM roles WHERE role_name = $1", [roleName])
            if (roleRes.rows.length) {
              await client.query(
                "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)",
                [userId, roleRes.rows[0].role_id]
              )
            }
        }
      }

      // Fetch final role list
      const rolesResult = await client.query(
        `SELECT r.role_name
         FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = $1`,
        [userId]
      )
      const finalRoles = rolesResult.rows.map(r => r.role_name)

      const changed_by_user_id = req.user?.user_id || null

      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          "users",
          userId,
          "UPDATE",
          JSON.stringify(currentData),
          JSON.stringify({ ...updatedUserRow, roles: finalRoles }),
          changed_by_user_id
        ]
      )

      await client.query("COMMIT")

      delete updatedUserRow.password_hash

      return ResponseHandler.success(
        res,
        { ...updatedUserRow, roles: finalRoles },
        "User updated successfully"
      )
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update user error:", error)
      return ResponseHandler.error(res, "Failed to update user")
    } finally {
      client.release()
    }
  }

  // --- ⭐️ START: UPDATED FUNCTION ⭐️ ---
  // Replaced `deactivateUser` with `toggleUserActiveState`
  static async toggleUserActiveState(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { userId } = req.params

      // Get current user data
      const currentResult = await client.query("SELECT * FROM users WHERE user_id = $1", [userId])

      if (currentResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "User not found")
      }

      const currentData = currentResult.rows[0]
      const newActiveState = !currentData.is_active // Flip the current state
      const actionType = newActiveState ? "REACTIVATE" : "DEACTIVATE"
      const actionMessage = newActiveState ? "User reactivated successfully" : "User deactivated successfully"

      // Update user's active state
      const result = await client.query(
        "UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 RETURNING *",
        [newActiveState, userId]
      )

      // --- ⭐️ START: FIX ⭐️ ---
      // Safely get the user ID for logging
      const changed_by_user_id = req.user?.user_id || null
      // --- ⭐️ END: FIX ⭐️ ---

      // Log the action
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "users",
          userId,
          actionType, // Use dynamic action type
          JSON.stringify(currentData),
          JSON.stringify(result.rows[0]),
          changed_by_user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, null, actionMessage)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Toggle user active state error:", error)
      return ResponseHandler.error(res, "Failed to update user active state")
    } finally {
      client.release()
    }
  }
  // --- ⭐️ END: UPDATED FUNCTION ⭐️ ---

  static async getRoles(req, res) {
    try {
      const query = "SELECT * FROM roles ORDER BY role_name"
      const result = await db.query(query)
      return ResponseHandler.success(res, result.rows, "Roles retrieved successfully")
    } catch (error) {
      console.error("Get roles error:", error)
      return ResponseHandler.error(res, "Failed to retrieve roles")
    }
  }
}

module.exports = UserController
