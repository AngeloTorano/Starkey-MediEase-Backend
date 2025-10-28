const express = require("express")
const { authenticateToken, requireRole, requireLocationAccess } = require("../middleware/auth")
const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)
router.use(requireLocationAccess)

// Dashboard overview
router.get("/overview", async (req, res) => {
  try {
    let locationFilter = ""
    const params = []

    // Apply location-based filtering for non-Admin users
    if (!req.user.roles.includes("Admin")) {
      if (req.user.roles.includes("City Coordinator")) {
        const userCities = req.user.locations.filter((loc) => loc.city_id).map((loc) => loc.city_name)
        if (userCities.length > 0) {
          locationFilter = "WHERE p.city_village = ANY($1)"
          params.push(userCities)
        }
      } else if (req.user.roles.includes("Country Coordinator")) {
        const userCountries = req.user.locations.filter((loc) => loc.country_id).map((loc) => loc.country_name)
        if (userCountries.length > 0) {
          locationFilter = "WHERE p.region_district = ANY($1)"
          params.push(userCountries)
        }
      }
    }

    const queries = {
      totalPatients: `SELECT COUNT(*) as count FROM patients p ${locationFilter}`,
      patientsByPhase: `
        SELECT ph.phase_name, COUNT(pp.patient_id) as count
        FROM patient_phases pp
        LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
        LEFT JOIN patients p ON pp.patient_id = p.patient_id
        ${locationFilter}
        GROUP BY ph.phase_id, ph.phase_name
        ORDER BY ph.phase_id
      `,
      recentPatients: `
        SELECT p.patient_id, p.shf_id, p.first_name, p.last_name, p.created_at
        FROM patients p
        ${locationFilter}
        ORDER BY p.created_at DESC
        LIMIT 10
      `,
      phaseCompletions: `
        SELECT ph.phase_name, COUNT(pp.patient_id) as count
        FROM patient_phases pp
        LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
        LEFT JOIN patients p ON pp.patient_id = p.patient_id
        WHERE pp.status = 'Completed' ${locationFilter ? "AND " + locationFilter.replace("WHERE ", "") : ""}
        GROUP BY ph.phase_id, ph.phase_name
        ORDER BY ph.phase_id
      `,
    }

    const results = {}

    for (const [key, query] of Object.entries(queries)) {
      const result = await db.query(query, params)
      results[key] = key === "totalPatients" ? result.rows[0].count : result.rows
    }

    return ResponseHandler.success(res, results, "Dashboard overview retrieved successfully")
  } catch (error) {
    console.error("Get dashboard overview error:", error)
    return ResponseHandler.error(res, "Failed to retrieve dashboard overview")
  }
})

// Supply dashboard (supply managers only)
router.get("/supplies", requireRole(["Admin", "supply_manager"]), async (req, res) => {
  try {
    const queries = {
      totalSupplies: "SELECT COUNT(*) as count FROM supplies",
      lowStockItems: `
        SELECT s.*, sc.category_name
        FROM supplies s
        LEFT JOIN supply_categories sc ON s.category_id = sc.category_id
        WHERE s.current_stock_level <= s.reorder_level
        ORDER BY s.current_stock_level ASC
      `,
      suppliesByCategory: `
        SELECT sc.category_name, COUNT(s.supply_id) as count
        FROM supply_categories sc
        LEFT JOIN supplies s ON sc.category_id = s.category_id
        GROUP BY sc.category_id, sc.category_name
        ORDER BY count DESC
      `,
      recentTransactions: `
        SELECT st.*, s.item_name, stt.type_name, u.username
        FROM supply_transactions st
        LEFT JOIN supplies s ON st.supply_id = s.supply_id
        LEFT JOIN supply_transaction_types stt ON st.transaction_type_id = stt.transaction_type_id
        LEFT JOIN users u ON st.recorded_by_user_id = u.user_id
        ORDER BY st.transaction_date DESC
        LIMIT 10
      `,
    }

    const results = {}

    for (const [key, query] of Object.entries(queries)) {
      const result = await db.query(query)
      results[key] = key === "totalSupplies" ? result.rows[0].count : result.rows
    }

    return ResponseHandler.success(res, results, "Supply dashboard retrieved successfully")
  } catch (error) {
    console.error("Get supply dashboard error:", error)
    return ResponseHandler.error(res, "Failed to retrieve supply dashboard")
  }
})

// User activity dashboard (Admin only)
router.get("/users", requireRole(["Admin"]), async (req, res) => {
  try {
    const queries = {
      totalUsers: "SELECT COUNT(*) as count FROM users WHERE is_active = true",
      usersByRole: `
        SELECT r.role_name, COUNT(ur.user_id) as count
        FROM roles r
        LEFT JOIN user_roles ur ON r.role_id = ur.role_id
        LEFT JOIN users u ON ur.user_id = u.user_id AND u.is_active = true
        GROUP BY r.role_id, r.role_name
        ORDER BY count DESC
      `,
      recentActivity: `
        SELECT al.action_type, al.table_name, al.change_timestamp, u.username
        FROM audit_logs al
        LEFT JOIN users u ON al.changed_by_user_id = u.user_id
        ORDER BY al.change_timestamp DESC
        LIMIT 20
      `,
      activeUsers: `
        SELECT u.user_id, u.username, u.first_name, u.last_name, u.email, 
               array_agg(r.role_name) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.user_id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.role_id
        WHERE u.is_active = true
        GROUP BY u.user_id
        ORDER BY u.created_at DESC
        LIMIT 10
      `,
    }

    const results = {}

    for (const [key, query] of Object.entries(queries)) {
      const result = await db.query(query)
      if (key === "totalUsers") {
        results[key] = result.rows[0].count
      } else if (key === "activeUsers") {
        results[key] = result.rows.map((user) => ({
          ...user,
          roles: user.roles.filter((role) => role !== null),
        }))
      } else {
        results[key] = result.rows
      }
    }

    return ResponseHandler.success(res, results, "User dashboard retrieved successfully")
  } catch (error) {
    console.error("Get user dashboard error:", error)
    return ResponseHandler.error(res, "Failed to retrieve user dashboard")
  }
})

// Analytics endpoint
router.get("/analytics", requireRole(["Admin", "City Coordinator", "Country Coordinator"]), async (req, res) => {
  try {
    const { start_date, end_date } = req.query

    let dateFilter = ""
    let locationFilter = ""
    const params = []

    if (start_date && end_date) {
      dateFilter = "AND p.created_at BETWEEN $1 AND $2"
      params.push(start_date, end_date)
    }

    // Apply location-based filtering for non-Admin users
    if (!req.user.roles.includes("Admin")) {
      if (req.user.roles.includes("City Coordinator")) {
        const userCities = req.user.locations.filter((loc) => loc.city_id).map((loc) => loc.city_name)
        if (userCities.length > 0) {
          locationFilter = `AND p.city_village = ANY($${params.length + 1})`
          params.push(userCities)
        }
      } else if (req.user.roles.includes("Country Coordinator")) {
        const userCountries = req.user.locations.filter((loc) => loc.country_id).map((loc) => loc.country_name)
        if (userCountries.length > 0) {
          locationFilter = `AND p.region_district = ANY($${params.length + 1})`
          params.push(userCountries)
        }
      }
    }

    const queries = {
      patientsByMonth: `
        SELECT 
          DATE_TRUNC('month', p.created_at) as month,
          COUNT(*) as count
        FROM patients p
        WHERE 1=1 ${dateFilter} ${locationFilter}
        GROUP BY DATE_TRUNC('month', p.created_at)
        ORDER BY month DESC
        LIMIT 12
      `,
      patientsByGender: `
        SELECT p.gender, COUNT(*) as count
        FROM patients p
        WHERE 1=1 ${dateFilter} ${locationFilter}
        GROUP BY p.gender
      `,
      patientsByAge: `
        SELECT 
          CASE 
            WHEN p.age < 18 THEN 'Under 18'
            WHEN p.age BETWEEN 18 AND 30 THEN '18-30'
            WHEN p.age BETWEEN 31 AND 50 THEN '31-50'
            WHEN p.age BETWEEN 51 AND 70 THEN '51-70'
            ELSE 'Over 70'
          END as age_group,
          COUNT(*) as count
        FROM patients p
        WHERE p.age IS NOT NULL ${dateFilter} ${locationFilter}
        GROUP BY age_group
        ORDER BY age_group
      `,
      phaseProgress: `
        SELECT 
          ph.phase_name,
          pp.status,
          COUNT(*) as count
        FROM patient_phases pp
        LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
        LEFT JOIN patients p ON pp.patient_id = p.patient_id
        WHERE 1=1 ${dateFilter} ${locationFilter}
        GROUP BY ph.phase_id, ph.phase_name, pp.status
        ORDER BY ph.phase_id, pp.status
      `,
    }

    const results = {}

    for (const [key, query] of Object.entries(queries)) {
      const result = await db.query(query, params)
      results[key] = result.rows
    }

    return ResponseHandler.success(res, results, "Analytics data retrieved successfully")
  } catch (error) {
    console.error("Get analytics error:", error)
    return ResponseHandler.error(res, "Failed to retrieve analytics data")
  }
})

module.exports = router
