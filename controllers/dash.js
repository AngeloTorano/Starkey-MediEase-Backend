const db = require("../config/database");

/**
 * A controller for handling dashboard-related data retrieval.
 * Gathers all key metrics in a single, efficient query.
 */
class DashController {
  /**
   * Get all aggregated data needed for the main dashboard.
   * Now accepts optional req.query.region AND req.query.gender to filter all results.
   */
  static async getDashboardData(req, res) {
    // --- MODIFIED: Filter Logic for Region and Gender ---
    const { region, gender } = req.query;

    const queryParams = [];
    const whereClauses = [];
    let paramIndex = 1; // To keep track of $1, $2, etc.

    if (region) {
      whereClauses.push(`region_district = $${paramIndex}`);
      queryParams.push(region);
      paramIndex++;
    }

    if (gender) {
      whereClauses.push(`gender = $${paramIndex}`);
      queryParams.push(gender);
      paramIndex++;
    }

    const filterCTE = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    // --- End Modified Filter Logic ---

    try {
      const dashboardQuery = `
        -- NEW: This CTE creates a base table of patients, either all or filtered.
        -- All subsequent queries will join against this.
        WITH FilteredPatients AS (
          SELECT patient_id, region_district, city_village, gender, age, created_at
          FROM patients
          ${filterCTE} -- This variable now contains all active filters
        )
        
        SELECT
          -- 1. Overall KPIs (Total Patients)
          (
            SELECT json_build_object('total_patients', COUNT(patient_id))
            FROM FilteredPatients
          ) AS kpis,

          -- 2. New Patients (Last 30 days, for a line chart)
          (
            SELECT json_agg(daily_data ORDER BY date)
            FROM (
              SELECT DATE(created_at) AS date, COUNT(patient_id) AS count
              FROM FilteredPatients
              GROUP BY DATE(created_at)
              ORDER BY date DESC
              LIMIT 30
            ) AS daily_data
          ) AS new_patients_by_day,

          -- 3. Patient Demographics (Gender, Age, Geography)
          (
            SELECT json_build_object(
              'gender', (
                SELECT json_agg(gender_data)
                FROM (
                  SELECT gender, COUNT(patient_id) AS count
                  FROM FilteredPatients
                  WHERE gender IS NOT NULL
                  GROUP BY gender
                ) AS gender_data
              ),
              'age', (
                SELECT json_agg(age_buckets ORDER BY age_range)
                FROM (
                  SELECT
                    CASE
                      WHEN age BETWEEN 0 AND 10 THEN '0-10'
                      WHEN age BETWEEN 11 AND 20 THEN '11-20'
                      WHEN age BETWEEN 21 AND 30 THEN '21-30'
                      WHEN age BETWEEN 31 AND 40 THEN '31-40'
                      WHEN age BETWEEN 41 AND 50 THEN '41-50'
                      WHEN age BETWEEN 51 AND 60 THEN '51-60'
                      WHEN age > 60 THEN '61+'
                      ELSE 'Unknown'
                    END AS age_range,
                    COUNT(patient_id) AS count
                  FROM FilteredPatients
                  GROUP BY age_range
                ) AS age_buckets
              ),
              'geography', (
                SELECT json_agg(region_data ORDER BY count DESC)
                FROM (
                  SELECT 
                    p_outer.region_district, 
                    COUNT(p_outer.patient_id) AS count,
                    (
                      SELECT json_agg(city_data ORDER BY city_count DESC)
                      FROM (
                        SELECT
                          city_village,
                          COUNT(patient_id) AS city_count
                        FROM FilteredPatients p_inner -- Using FilteredPatients
                        WHERE p_inner.region_district = p_outer.region_district
                          AND p_inner.city_village IS NOT NULL
                        GROUP BY city_village
                      ) AS city_data
                    ) AS cities
                  FROM FilteredPatients p_outer -- Using FilteredPatients
                  WHERE p_outer.region_district IS NOT NULL
                  GROUP BY p_outer.region_district
                  ORDER BY count DESC
                  LIMIT 10
                ) AS region_data
              )
            )
          ) AS demographics,

          -- 4. Patient Funnel
          (
            SELECT json_agg(funnel_data ORDER BY phase_id)
            FROM (
              SELECT pp.phase_id, COUNT(DISTINCT pp.patient_id) AS patient_count
              FROM patient_phases pp
              JOIN FilteredPatients fp ON pp.patient_id = fp.patient_id -- Join against filtered list
              GROUP BY pp.phase_id
            ) AS funnel_data
          ) AS patient_funnel,

          -- 5. Common Hearing Loss Causes
          (
            SELECT json_agg(causes_data ORDER BY count DESC)
            FROM (
              SELECT cause, COUNT(*) AS count
              FROM (
                SELECT UNNEST(p1.hearing_loss_causes) AS cause
                FROM phase1_registration_section p1
                JOIN FilteredPatients fp ON p1.patient_id = fp.patient_id -- Join against filtered list
              ) AS unnested_causes
              WHERE cause IS NOT NULL
              GROUP BY cause
              ORDER BY count DESC
              LIMIT 10
            ) AS causes_data
          ) AS common_causes,

          -- 6. Common Ear Issues
          (
            SELECT json_agg(issues_data ORDER BY count DESC)
            FROM (
              SELECT 'Wax' AS issue_type, COUNT(*) AS count FROM ear_screening es JOIN FilteredPatients fp ON es.patient_id = fp.patient_id WHERE es.otc_wax > 0
              UNION ALL
              SELECT 'Infection' AS issue_type, COUNT(*) AS count FROM ear_screening es JOIN FilteredPatients fp ON es.patient_id = fp.patient_id WHERE es.otc_infection > 0
              UNION ALL
              SELECT 'Perforation' AS issue_type, COUNT(*) AS count FROM ear_screening es JOIN FilteredPatients fp ON es.patient_id = fp.patient_id WHERE es.otc_perforation > 0
              UNION ALL
              SELECT 'Tinnitus' AS issue_type, COUNT(*) AS count FROM ear_screening es JOIN FilteredPatients fp ON es.patient_id = fp.patient_id WHERE es.otc_tinnitus > 0
              UNION ALL
              SELECT 'Atresia' AS issue_type, COUNT(*) AS count FROM ear_screening es JOIN FilteredPatients fp ON es.patient_id = fp.patient_id WHERE es.otc_atresia > 0
              UNION ALL
              SELECT 'Implant' AS issue_type, COUNT(*) AS count FROM ear_screening es JOIN FilteredPatients fp ON es.patient_id = fp.patient_id WHERE es.otc_implant > 0
              UNION ALL
              SELECT 'Other' AS issue_type, COUNT(*) AS count FROM ear_screening es JOIN FilteredPatients fp ON es.patient_id = fp.patient_id WHERE es.otc_other > 0
            ) AS issues_data
          ) AS common_issues,

          -- 7. Total Aids Fitted
          (
            SELECT json_build_object('total_aids_fitted', SUM(f.number_of_hearing_aid))
            FROM fitting f
            JOIN FilteredPatients fp ON f.patient_id = fp.patient_id -- Join against filtered list
          ) AS total_aids_fitted,
          
          -- 8. Patient Satisfaction
          (
            SELECT json_build_object(
              'phase1', (
                SELECT json_agg(satisfaction_data)
                FROM (
                  SELECT p1.hearing_satisfaction_18_plus AS rating, COUNT(*) AS count
                  FROM phase1_registration_section p1
                  JOIN FilteredPatients fp ON p1.patient_id = fp.patient_id -- Join
                  WHERE p1.hearing_satisfaction_18_plus IS NOT NULL
                  GROUP BY p1.hearing_satisfaction_18_plus
                ) AS satisfaction_data
              ),
              'phase2', (
                SELECT json_agg(satisfaction_data)
                FROM (
                  SELECT p2.hearing_aid_satisfaction_18_plus AS rating, COUNT(*) AS count
                  FROM final_qc_p2 p2
                  JOIN FilteredPatients fp ON p2.patient_id = fp.patient_id -- Join
                  WHERE p2.hearing_aid_satisfaction_18_plus IS NOT NULL
                  GROUP BY p2.hearing_aid_satisfaction_18_plus
                ) AS satisfaction_data
              ),
              'phase3', (
                SELECT json_agg(satisfaction_data)
                FROM (
                  SELECT p3.hearing_aid_satisfaction_18_plus AS rating, COUNT(*) AS count
                  FROM final_qc_p3 p3
                  JOIN FilteredPatients fp ON p3.patient_id = fp.patient_id -- Join
                  WHERE p3.hearing_aid_satisfaction_18_plus IS NOT NULL
                  GROUP BY p3.hearing_aid_satisfaction_18_plus
                ) AS satisfaction_data
              )
            )
          ) AS patient_satisfaction;
      `;

      // Pass the dynamic parameters to the query
      const result = await db.query(dashboardQuery, queryParams);
      const data = result.rows[0];

      // ... (rest of the responseData formatting is the same)
      const responseData = {
        total_patients: data.kpis?.total_patients || 0,
        new_patients_by_day: data.new_patients_by_day || [],
        demographics: {
          gender: data.demographics?.gender || [],
          age_distribution: data.demographics?.age || [],
          geographic_distribution: data.demographics?.geography || [],
        },
        patient_funnel: data.patient_funnel || [],
        common_causes: data.common_causes || [],
        common_issues: data.common_issues || [],
        total_aids_fitted: data.total_aids_fitted?.total_aids_fitted || 0,
        patient_satisfaction: {
          phase1: data.patient_satisfaction?.phase1 || [],
          phase2: data.patient_satisfaction?.phase2 || [],
          phase3: data.patient_satisfaction?.phase3 || [],
        },
      };

      return res.status(200).json({
        success: true,
        message: "Dashboard data fetched successfully",
        data: responseData,
      });

    } catch (error) {
      console.error("Dashboard error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard data",
        error: error.message,
      });
    }
  }

  /**
   * --- NEW FUNCTION ---
   * Get a simple list of unique regions to populate the filter dropdown.
   */
  static async getRegionList(req, res) {
    try {
      const query = `
        SELECT DISTINCT region_district 
        FROM patients 
        WHERE region_district IS NOT NULL 
        ORDER BY region_district ASC
      `;
      const result = await db.query(query);
      
      // Return an array of strings
      const regions = result.rows.map(row => row.region_district);

      return res.status(200).json({
        success: true,
        message: "Regions fetched successfully",
        data: regions,
      });
    } catch (error) {
      console.error("Failed to fetch regions:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch regions",
        error: error.message,
      });
    }
  }
}

module.exports = DashController;