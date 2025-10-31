const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

class ScheduleController {
  // 🟢 CREATE Schedule
  static async createSchedule(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { mission_name, description, AfterCareCity, date, time, status } = req.body
      const createdByUserId = req.user.user_id

      const result = await client.query(
        `INSERT INTO schedules (mission_name, description, AfterCareCity, date, time, status, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [mission_name, description, AfterCareCity, date, time, status || "Pending", createdByUserId]
      )

      const schedule = result.rows[0]

      // Log creation
      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ["schedules", schedule.schedule_id, "CREATE", JSON.stringify(schedule), createdByUserId]
      )

      await client.query("COMMIT")
      return ResponseHandler.success(res, schedule, "Schedule created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create schedule error:", error)
      return ResponseHandler.error(res, "Failed to create schedule")
    } finally {
      client.release()
    }
  }

  // 🟡 GET All Schedules (with filters)
  static async getSchedules(req, res) {
    try {
      const { status, city, date } = req.query

      let query = `
        SELECT s.*, u.first_name, u.last_name
        FROM schedules s
        LEFT JOIN users u ON s.created_by_user_id = u.user_id
      `

      const conditions = []
      const params = []

      if (status) {
        conditions.push(`s.status = $${params.length + 1}`)
        params.push(status)
      }

      if (city) {
        conditions.push(`s.AfterCareCity ILIKE $${params.length + 1}`)
        params.push(`%${city}%`)
      }

      if (date) {
        conditions.push(`s.date = $${params.length + 1}`)
        params.push(date)
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += " ORDER BY s.date DESC, s.time ASC"

      const result = await db.query(query, params)
      return ResponseHandler.success(res, result.rows, "Schedules retrieved successfully")
    } catch (error) {
      console.error("Get schedules error:", error)
      return ResponseHandler.error(res, "Failed to retrieve schedules")
    }
  }

  // 🟠 GET Schedule by ID
  static async getScheduleById(req, res) {
    try {
      const { scheduleId } = req.params

      const result = await db.query(
        `SELECT s.*, u.first_name, u.last_name
         FROM schedules s
         LEFT JOIN users u ON s.created_by_user_id = u.user_id
         WHERE s.schedule_id = $1`,
        [scheduleId]
      )

      if (result.rows.length === 0) {
        return ResponseHandler.notFound(res, "Schedule not found")
      }

      return ResponseHandler.success(res, result.rows[0], "Schedule retrieved successfully")
    } catch (error) {
      console.error("Get schedule by ID error:", error)
      return ResponseHandler.error(res, "Failed to retrieve schedule")
    }
  }

  // 🟣 UPDATE Schedule
  static async updateSchedule(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { scheduleId } = req.params
      const updateData = req.body

      const currentResult = await client.query("SELECT * FROM schedules WHERE schedule_id = $1", [scheduleId])
      if (currentResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Schedule not found")
      }

      const currentData = currentResult.rows[0]
      const fields = Object.keys(updateData)
      const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(", ")
      const values = [scheduleId, ...Object.values(updateData)]

      const result = await client.query(
        `UPDATE schedules
         SET ${setClause}, updated_at = CURRENT_TIMESTAMP
         WHERE schedule_id = $1
         RETURNING *`,
        values
      )

      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          "schedules",
          scheduleId,
          "UPDATE",
          JSON.stringify(currentData),
          JSON.stringify(result.rows[0]),
          req.user.user_id,
        ]
      )

      await client.query("COMMIT")
      return ResponseHandler.success(res, result.rows[0], "Schedule updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update schedule error:", error)
      return ResponseHandler.error(res, "Failed to update schedule")
    } finally {
      client.release()
    }
  }

  // 🔴 DELETE Schedule
  static async deleteSchedule(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { scheduleId } = req.params
      const existing = await client.query("SELECT * FROM schedules WHERE schedule_id = $1", [scheduleId])

      if (existing.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Schedule not found")
      }

      await client.query("DELETE FROM schedules WHERE schedule_id = $1", [scheduleId])

      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, old_data, changed_by_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          "schedules",
          scheduleId,
          "DELETE",
          JSON.stringify(existing.rows[0]),
          req.user.user_id,
        ]
      )

      await client.query("COMMIT")
      return ResponseHandler.success(res, null, "Schedule deleted successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Delete schedule error:", error)
      return ResponseHandler.error(res, "Failed to delete schedule")
    } finally {
      client.release()
    }
  }
}

module.exports = ScheduleController
