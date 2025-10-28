const express = require("express")
const { authenticateToken, requireRole } = require("../middleware/auth")
const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// Get all phases
router.get("/", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM phases ORDER BY phase_id")
    return ResponseHandler.success(res, result.rows, "Phases retrieved successfully")
  } catch (error) {
    console.error("Get phases error:", error)
    return ResponseHandler.error(res, "Failed to retrieve phases")
  }
})

// Get patient phases
router.get("/patient/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params

    const query = `
      SELECT pp.*, p.phase_name, p.phase_description, u.username as completed_by
      FROM patient_phases pp
      LEFT JOIN phases p ON pp.phase_id = p.phase_id
      LEFT JOIN users u ON pp.completed_by_user_id = u.user_id
      WHERE pp.patient_id = $1
      ORDER BY pp.phase_id
    `

    const result = await db.query(query, [patientId])
    return ResponseHandler.success(res, result.rows, "Patient phases retrieved successfully")
  } catch (error) {
    console.error("Get patient phases error:", error)
    return ResponseHandler.error(res, "Failed to retrieve patient phases")
  }
})

// Complete a phase for a patient
router.put(
  "/patient/:patientId/phase/:phaseId/complete",
  requireRole(["Admin", "City Coordinator", "Country Coordinator"]),
  async (req, res) => {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { patientId, phaseId } = req.params

      // Update phase status to completed
      const result = await client.query(
        `UPDATE patient_phases 
       SET status = 'Completed', phase_end_date = CURRENT_DATE, completed_by_user_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE patient_id = $2 AND phase_id = $3
       RETURNING *`,
        [req.user.user_id, patientId, phaseId],
      )

      if (result.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Patient phase not found")
      }

      // Log phase completion
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        [
          "patient_phases",
          result.rows[0].patient_phase_id,
          "PHASE_COMPLETE",
          JSON.stringify(result.rows[0]),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "Phase completed successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Complete phase error:", error)
      return ResponseHandler.error(res, "Failed to complete phase")
    } finally {
      client.release()
    }
  },
)

module.exports = router
