const db = require("../config/database")

class ReportsController {
  /**
   * 1️⃣ Summary Report
   */
  static async getSummary(req, res) {
    try {
      const totalPatientsQuery = await db.query(`SELECT COUNT(*) FROM patients`)
      const totalFittingsQuery = await db.query(`SELECT COUNT(*) FROM fitting`)
      const totalMissionsQuery = await db.query(`SELECT COUNT(DISTINCT city_village) FROM patients`)
      const completedPhasesQuery = await db.query(`
        SELECT COUNT(*) FROM patient_phases WHERE status ILIKE 'Completed'
      `)

      const totalPatients = parseInt(totalPatientsQuery.rows[0].count)
      const completedPhases = parseInt(completedPhasesQuery.rows[0].count)
      const successRate = totalPatients > 0 ? ((completedPhases / totalPatients) * 100).toFixed(1) : 0

      res.json({
        total_patients: totalPatients,
        total_fittings: parseInt(totalFittingsQuery.rows[0].count),
        total_missions: parseInt(totalMissionsQuery.rows[0].count),
        success_rate: successRate,
        message: "Summary analytics retrieved successfully"
      })
    } catch (error) {
      console.error("Get summary analytics error:", error)
      res.status(500).json({ error: "Failed to retrieve summary analytics" })
    }
  }

  /**
   * 2️⃣ Demographics Analytics
   */
  static async getDemographics(req, res) {
    try {
      const ageGroupsQuery = `
        SELECT
          CASE
            WHEN age <= 18 THEN '0-18'
            WHEN age BETWEEN 19 AND 35 THEN '19-35'
            WHEN age BETWEEN 36 AND 50 THEN '36-50'
            WHEN age BETWEEN 51 AND 65 THEN '51-65'
            ELSE '65+'
          END AS age_group,
          COUNT(*) AS count
        FROM patients
        GROUP BY age_group
        ORDER BY age_group
      `
      const genderQuery = `
        SELECT gender, COUNT(*) AS count
        FROM patients
        WHERE gender IS NOT NULL
        GROUP BY gender
      `
      const regionQuery = `
        SELECT region_district AS region, COUNT(*) AS count
        FROM patients
        WHERE region_district IS NOT NULL
        GROUP BY region_district
        ORDER BY count DESC
      `

      const [ageGroups, genders, regions] = await Promise.all([
        db.query(ageGroupsQuery),
        db.query(genderQuery),
        db.query(regionQuery),
      ])

      res.json({
        age_groups: ageGroups.rows,
        genders: genders.rows,
        regions: regions.rows,
        message: "Demographics analytics retrieved successfully"
      })
    } catch (error) {
      console.error("Get demographics analytics error:", error)
      res.status(500).json({ error: "Failed to retrieve demographics analytics" })
    }
  }

  /**
   * 3️⃣ Medical Analytics
   */
  static async getMedical(req, res) {
    try {
      const causesQuery = `
        SELECT TRIM(unnest(hearing_loss_causes)) AS cause, COUNT(*) AS count
        FROM phase1_registration_section
        WHERE hearing_loss_causes IS NOT NULL
        GROUP BY cause
        ORDER BY count DESC
      `
      const outcomesQuery = `
        SELECT 
          p.phase_name,
          SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN pp.status ILIKE 'Ongoing' THEN 1 ELSE 0 END) AS ongoing,
          COUNT(*) AS total
        FROM patient_phases pp
        JOIN phases p ON p.phase_id = pp.phase_id
        GROUP BY p.phase_name
        ORDER BY p.phase_name
      `

      const [causes, outcomes] = await Promise.all([
        db.query(causesQuery),
        db.query(outcomesQuery),
      ])

      res.json({
        hearing_loss_causes: causes.rows,
        treatment_outcomes: outcomes.rows,
        message: "Medical analytics retrieved successfully"
      })
    } catch (error) {
      console.error("Get medical analytics error:", error)
      res.status(500).json({ error: "Failed to retrieve medical analytics" })
    }
  }

  /**
   * 4️⃣ Patient Geographic Distribution
   */
  static async getPatientGeographic(req, res) {
    try {
      const query = `
        SELECT 
          region_district AS region,
          COUNT(*)::int AS patient_count
        FROM patients
        WHERE region_district IS NOT NULL 
          AND region_district <> ''
        GROUP BY region_district
        ORDER BY region_district;
      `
      const result = await db.query(query);
      res.json({
        patient_distribution: result.rows,
        message: "Patient geographic data retrieved successfully"
      });
    } catch (error) {
      console.error("Get patient geographic data error:", error);
      res.status(500).json({ error: "Failed to retrieve patient geographic data" });
    }
  }

  /**
   * 5️⃣ Mission & Performance Analytics
   */
  static async getPerformance(req, res) {
    try {
      const query = `
        SELECT 
          p.phase_name,
          COUNT(DISTINCT pp.patient_id) AS patients_served,
          SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) AS completed,
          ROUND(
            (SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END)::decimal /
            COUNT(pp.patient_id)) * 100, 1
          ) AS success_rate
        FROM patient_phases pp
        JOIN phases p ON p.phase_id = pp.phase_id
        GROUP BY p.phase_name
        ORDER BY p.phase_name
      `
      const result = await db.query(query)
      res.json({
        performance: result.rows,
        message: "Performance analytics retrieved successfully"
      })
    } catch (error) {
      console.error("Get performance analytics error:", error)
      res.status(500).json({ error: "Failed to retrieve performance analytics" })
    }
  }
}

module.exports = ReportsController
