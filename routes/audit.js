const express = require("express")
const { authenticateToken, requireRole } = require("../middleware/auth")
const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// Get audit logs (Admin only)
router.get("/", requireRole(["Admin"]), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      table_name,
      action_type,
      user_id,
      start_date,
      end_date
    } = req.query;

    const offset = (page - 1) * limit;

    let query = `
      SELECT al.*, u.username, u.first_name, u.last_name
      FROM audit_logs al
      LEFT JOIN users u ON al.changed_by_user_id = u.user_id
    `;

    const conditions = [];
    const params = [];

    if (table_name) {
      conditions.push(`al.table_name = $${params.length + 1}`);
      params.push(table_name);
    }

    if (action_type) {
      conditions.push(`al.action_type = $${params.length + 1}`);
      params.push(action_type);
    }

    if (user_id) {
      conditions.push(`al.changed_by_user_id = $${params.length + 1}`);
      params.push(user_id);
    }

    if (start_date) {
      conditions.push(`al.change_timestamp >= $${params.length + 1}`);
      params.push(start_date);
    }

    if (end_date) {
      conditions.push(`al.change_timestamp <= $${params.length + 1}`);
      params.push(end_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY al.change_timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Count total records (for pagination info)
    let countQuery = `
      SELECT COUNT(*) AS total
      FROM audit_logs al
    `;
    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(" AND ")}`;
    }
    const countResult = await db.query(countQuery, params.slice(0, params.length - 2));
    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    return ResponseHandler.success(res, {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages,
      data: result.rows,
    }, "Audit logs retrieved successfully");
  } catch (error) {
    console.error("Get audit logs error:", error);
    return ResponseHandler.error(res, "Failed to retrieve audit logs");
  }
});



// Get audit log by ID
router.get("/:logId", requireRole(["Admin"]), async (req, res) => {
  try {
    const { logId } = req.params

    const query = `
      SELECT al.*, u.username, u.first_name, u.last_name
      FROM audit_logs al
      LEFT JOIN users u ON al.changed_by_user_id = u.user_id
      WHERE al.log_id = $1
    `

    const result = await db.query(query, [logId])

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, "Audit log not found")
    }

    return ResponseHandler.success(res, result.rows[0], "Audit log retrieved successfully")
  } catch (error) {
    console.error("Get audit log error:", error)
    return ResponseHandler.error(res, "Failed to retrieve audit log")
  }
})

// Get audit statistics
router.get("/stats/summary", requireRole(["Admin"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query

    let dateFilter = ""
    const params = []

    if (start_date && end_date) {
      dateFilter = "WHERE change_timestamp BETWEEN $1 AND $2"
      params.push(start_date, end_date)
    }

    const queries = {
      totalLogs: `SELECT COUNT(*) as count FROM audit_logs ${dateFilter}`,
      actionTypes: `
        SELECT action_type, COUNT(*) as count 
        FROM audit_logs ${dateFilter}
        GROUP BY action_type 
        ORDER BY count DESC
      `,
      tableActivity: `
        SELECT table_name, COUNT(*) as count 
        FROM audit_logs ${dateFilter}
        GROUP BY table_name 
        ORDER BY count DESC
      `,
      userActivity: `
        SELECT u.username, u.first_name, u.last_name, COUNT(*) as count
        FROM audit_logs al
        LEFT JOIN users u ON al.changed_by_user_id = u.user_id
        ${dateFilter}
        GROUP BY u.user_id, u.username, u.first_name, u.last_name
        ORDER BY count DESC
        LIMIT 10
      `,
    }

    const results = {}

    for (const [key, query] of Object.entries(queries)) {
      const result = await db.query(query, params)
      results[key] = key === "totalLogs" ? result.rows[0].count : result.rows
    }

    return ResponseHandler.success(res, results, "Audit statistics retrieved successfully")
  } catch (error) {
    console.error("Get audit statistics error:", error)
    return ResponseHandler.error(res, "Failed to retrieve audit statistics")
  }
})

module.exports = router
