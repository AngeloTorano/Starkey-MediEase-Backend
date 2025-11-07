const db = require("../config/database");
const fs = require("fs");
const path = require("path");
const REGIONS_LIST = [
  { id: "NCR", name: "National Capital Region (NCR)" },
  { id: "CAR", name: "Cordillera Administrative Region (CAR)" },
  { id: "Region I", name: "Ilocos Region (Region I)" },
  { id: "Region II", name: "Cagayan Valley (Region II)" },
  { id: "Region III", name: "Central Luzon (Region III)" },
  { id: "Region IV-A", name: "CALABARZON (Region IV-A)" },
  { id: "Region IV-B", name: "MIMAROPA (Region IV-B)" },
  { id: "Region V", name: "Bicol Region (Region V)" },
  { id: "Region VI", name: "Western Visayas (Region VI)" },
  { id: "Region VII", name: "Central Visayas (Region VII)" },
  { id: "Region VIII", name: "Eastern Visayas (Region VIII)" },
  { id: "Region IX", name: "Zamboanga Peninsula (Region IX)" },
  { id: "Region X", name: "Northern Mindanao (Region X)" },
  { id: "Region XI", name: "Davao Region (Region XI)" },
  { id: "Region XII", name: "SOCCSKSARGEN (Region XII)" },
  { id: "Region XIII", name: "Caraga (Region XIII)" },
  { id: "BARMM", name: "Bangsamoro" }, // 'Bangsamoro' is in phDataset
];

/**
 * Normalizes a region name (from DB or JSON) to a standard ID (e.g., "CAR" or "Region I")
 */
const normalizeRegionToID = (raw = "") => {
  const s = raw ? String(raw).toUpperCase().replace(/\s+/g, " ").trim() : "";
  if (!s) return null;

  // Handle common names from phDataset.json that are not just IDs
  if (s === 'BANGSAMORO') return 'BARMM';
  if (s === 'CARAGA') return 'Region XIII';

  // Find by ID (e.g., "CAR", "Region I")
  const byId = REGIONS_LIST.find((r) => r.id.toUpperCase() === s);
  if (byId) return byId.id;

  // Find by partial match in name (e.g., "Cordillera Administrative Region (CAR)" includes "CAR")
  const byName = REGIONS_LIST.find(
    (r) => r.name.toUpperCase().includes(s) || s.includes(r.name.toUpperCase())
  );
  if (byName) return byName.id;
  
  // Try to find by regex match (e.g., "Region IV-A")
  const match = s.match(/REGION\s*(\d+|IV-A|IV-B|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII)/);
  if (match) {
    const key = "Region " + match[1];
    const found = REGIONS_LIST.find((r) => r.id.toUpperCase() === key.toUpperCase());
    if (found) return found.id;
  }
  
  // console.warn(`[Geo] Could not normalize region: ${raw}`);
  return null; // Return null if no match
};
// --- END: Region Normalization Logic ---


// --- Helper: Load and build a coordinate lookup map from the JSON file ---
// NEW ROBUST STRATEGY:
// Key = CITY NAME (UPPERCASE)
// Value = Array of possible locations (since "San Jose" can be in multiple regions)
const buildCoordsMap = () => {
  try {
    // IMPORTANT: Make sure this path is correct!
    const jsonPath = path.join(__dirname, "..", "data", "phDataset.json");
    const fileContent = fs.readFileSync(jsonPath, "utf8");
    const citiesData = JSON.parse(fileContent);

    const map = new Map();
    for (const item of citiesData) {
      if (item.city && item.Latitude && item.Longitude) {
        const key = String(item.city).trim().toUpperCase();
        
        const locationData = {
          latitude: item.Latitude,
          longitude: item.Longitude,
          regionJSON: item.region, // Store original region name from JSON
          provinceJSON: item.province, // Store province from JSON
        };

        if (!map.has(key)) {
          // If this is the first time we see this city, create a new array
          map.set(key, [locationData]);
        } else {
          // If this city name already exists, add this location to its array
          map.get(key).push(locationData);
        }
      }
    }
    console.log(`[Dashboard] Loaded ${map.size} unique city names from JSON.`);
    return map;
  } catch (error) {
    console.error(
      "!!! CRITICAL ERROR: Could not load phDataset.json.",
      error.message
    );
    return new Map();
  }
};

const cityCoordinatesMap = buildCoordsMap();

class dashboardController {
  
  /**
   * 🗺️ GET PATIENT CITY DISTRIBUTION (for Map) - NEW ROBUST LOGIC
   */
  static async getPatientCityDistribution(req, res) {
    try {
      const filterParams = dashboardController.buildFilterParams(req.query);
      const { whereClause, params } = filterParams;

      // Get counts grouped by region and city from the database
      const query = `
        SELECT 
          COALESCE(region_district, 'Not Specified') as region_district,
          COALESCE(city_village, 'Not Specified') as city,
          COUNT(*)::int AS patient_count
        FROM patients p
        ${whereClause}
        GROUP BY region_district, city_village
        HAVING COUNT(*) > 0;
      `;

      const dbResult = await db.query(query, params);

      const patientDistribution = dbResult.rows
        .map((row) => {
          const cityKey = String(row.city).trim().toUpperCase();
          
          // 1. Find all possible locations for this city name
          const possibleMatches = cityCoordinatesMap.get(cityKey);

          if (!possibleMatches) {
            // If the city name isn't in our JSON file at all, skip it.
            // console.warn(`No JSON entry found for city: ${row.city}`);
            return null;
          }

          let coords;
          if (possibleMatches.length === 1) {
            // 2. If there's only one city by this name, it's a unique match. Use it.
            coords = possibleMatches[0];
          } else {
            // 3. If there are multiple cities (e.g., "San Jose"), use the region to find the correct one.
            const dbRegionID = normalizeRegionToID(row.region_district);
            
            if (dbRegionID) {
              // Find the JSON entry where the region *also* matches our DB region
              coords = possibleMatches.find(match => {
                const jsonRegionID = normalizeRegionToID(match.regionJSON);
                return jsonRegionID === dbRegionID;
              });
            }

            if (!coords) {
              // If we couldn't find a region match (or DB region was null), just pick the first one.
              // It's better to show a pin in the wrong "San Jose" than no pin at all.
              coords = possibleMatches[0];
              // console.warn(`Could not find region match for duplicate city: ${row.city} in region ${row.region_district}. Using first available.`);
            }
          }

          // 4. Return the final object
          return {
            region: coords.regionJSON, // Use original region name from JSON
            province: coords.provinceJSON, // Get province from JSON
            city: row.city, // Use city name from DB
            patient_count: row.patient_count,
            latitude: coords.latitude,
            longitude: coords.longitude,
          };
        })
        .filter(Boolean); // Filter out any null entries

      res.json({
        patient_distribution: patientDistribution,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Patient city distribution retrieved successfully",
      });
    } catch (error) {
      console.error("Get patient city distribution error:", error);
      res
        .status(500)
        .json({ error: "Failed to retrieve patient city distribution" });
    }
  }

  // --- EXISTING FUNCTIONS (No changes below this line) ---

  static async getComprehensiveDashboard(req, res) {
    try {
      const filterParams = dashboardController.buildFilterParams(req.query);
      const { whereClause, params } = filterParams;

      // Execute all analytics in parallel for performance
      const [
        kpiMetrics,
        demographicAnalytics,
        medicalAnalytics,
        geographicAnalytics,
        performanceAnalytics,
        phaseProgress,
        timeSeriesData,
      ] = await Promise.all([
        dashboardController.getKPIMetrics(whereClause, params),
        dashboardController.getDemographicAnalytics(whereClause, params),
        dashboardController.getMedicalAnalytics(whereClause, params),
        dashboardController.getGeographicAnalytics(whereClause, params),
        dashboardController.getPerformanceAnalytics(whereClause, params),
        dashboardController.getPhaseProgressAnalytics(whereClause, params),
        dashboardController.getTimeSeriesAnalytics(whereClause, params),
      ]);

      res.json({
        kpi_metrics: kpiMetrics,
        demographics: demographicAnalytics,
        medical_analytics: medicalAnalytics,
        geographic_distribution: geographicAnalytics,
        performance_metrics: performanceAnalytics,
        phase_progress: phaseProgress,
        time_series: timeSeriesData,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Comprehensive dashboard data retrieved successfully",
      });
    } catch (error) {
      console.error("Get comprehensive dashboard error:", error);
      res
        .status(500)
        .json({ error: "Failed to retrieve comprehensive dashboard data" });
    }
  }

  static async getEnhancedSummary(req, res) {
    try {
      const filterParams = dashboardController.buildFilterParams(req.query);
      const { whereClause, params } = filterParams;

      const kpiMetrics = await dashboardController.getKPIMetrics(
        whereClause,
        params
      );
      const timeSeriesData = await dashboardController.getTimeSeriesAnalytics(
        whereClause,
        params
      );

      res.json({
        summary: kpiMetrics,
        trends: {
          monthly: timeSeriesData.monthly_metrics,
          growth_rate: dashboardController.calculateGrowthRate(
            timeSeriesData.monthly_metrics
          ),
        },
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Enhanced summary analytics retrieved successfully",
      });
    } catch (error) {
      console.error("Get enhanced summary analytics error:", error);
      res
        .status(500)
        .json({ error: "Failed to retrieve enhanced summary analytics" });
    }
  }

  static async getKPIMetrics(a = "", b = []) {
    // Detect route handler call: a=req, b=res
    let whereClause = a;
    let params = b;
    let isHandler = false;
    let req = null;
    let res = null;

    if (a && a.query && b && typeof b.json === "function") {
      req = a;
      res = b;
      const filterParams = dashboardController.buildFilterParams(req.query);
      whereClause = filterParams.whereClause;
      params = filterParams.params;
      isHandler = true;
    }

    const baseFrom = `FROM patients p ${whereClause ? whereClause : ""}`;

    const queries = {
      totalPatients: `SELECT COUNT(*) as count ${baseFrom}`,
      totalFittings: `SELECT COUNT(*) as count FROM fitting f JOIN patients p ON f.patient_id = p.patient_id ${
        whereClause ? whereClause : ""
      }`,
      completedPhases: (() => {
        const base = `SELECT COUNT(*) as count FROM patient_phases pp JOIN patients p ON pp.patient_id = p.patient_id`;
        const final =
          whereClause && whereClause.trim() !== ""
            ? `${base} WHERE pp.status ILIKE 'Completed' AND ${whereClause.replace(/^WHERE\s+/i, "")}`
            : `${base} WHERE pp.status ILIKE 'Completed'`;
        return final;
      })(),
      activePatients: (() => {
        const base = `SELECT COUNT(DISTINCT p.patient_id) as count FROM patients p JOIN patient_phases pp ON p.patient_id = pp.patient_id`;
        const final =
          whereClause && whereClause.trim() !== ""
            ? `${base} WHERE pp.status = 'Ongoing' AND ${whereClause.replace(/^WHERE\s+/i, "")}`
            : `${base} WHERE pp.status = 'Ongoing'`;
        return final;
      })(),
      avgAge: (() => {
        const base = `SELECT AVG(age) as avg_age FROM patients p`;
        return whereClause && whereClause.trim() !== ""
          ? `${base} ${whereClause} AND age IS NOT NULL`
          : `${base} WHERE age IS NOT NULL`;
      })(),
      genderDistribution: (() => {
        const base = `SELECT gender, COUNT(*) as count FROM patients p`;
        return whereClause && whereClause.trim() !== ""
          ? `${base} ${whereClause} AND gender IS NOT NULL GROUP BY gender`
          : `${base} WHERE gender IS NOT NULL GROUP BY gender`;
      })(),
    };

    const results = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await db.query(query, params);
      results[key] = result.rows;
    }

    const totalPatients = parseInt(results.totalPatients[0]?.count || 0);
    const completedPhases = parseInt(results.completedPhases[0]?.count || 0);
    const successRate =
      totalPatients > 0
        ? ((completedPhases / totalPatients) * 100).toFixed(1)
        : 0;

    const avgAgeValue = results.avgAge[0]?.avg_age;
    const avgAgeRounded =
      avgAgeValue !== null && avgAgeValue !== undefined
        ? parseFloat(avgAgeValue).toFixed(1)
        : null;

    const output = {
      total_patients: totalPatients,
      total_fittings: parseInt(results.totalFittings[0]?.count || 0),
      active_patients: parseInt(results.activePatients[0]?.count || 0),
      success_rate: parseFloat(successRate),
      average_age: avgAgeRounded !== null ? parseFloat(avgAgeRounded) : null,
      completion_rate: parseFloat(successRate),
      gender_breakdown: results.genderDistribution,
    };

    if (isHandler) {
      return res.json({
        kpi_metrics: output,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "KPI metrics retrieved successfully",
      });
    }

    return output;
  }

  static async getDemographicAnalytics(a = "", b = []) {
    let whereClause = a;
    let params = b;
    let isHandler = false;
    let req = null;
    let res = null;

    if (a && a.query && b && typeof b.json === "function") {
      req = a;
      res = b;
      const filterParams = dashboardController.buildFilterParams(req.query);
      whereClause = filterParams.whereClause;
      params = filterParams.params;
      isHandler = true;
    }

    const totalCountSub = `(SELECT COUNT(*) FROM patients p ${
      whereClause ? whereClause : ""
    })`;

    const ageDistributionQuery = `
      SELECT
        CASE
          WHEN age <= 18 THEN '0-18'
          WHEN age BETWEEN 19 AND 35 THEN '19-35'
          WHEN age BETWEEN 36 AND 50 THEN '36-50'
          WHEN age BETWEEN 51 AND 65 THEN '51-65'
          ELSE '65+' 
        END AS age_group,
        COUNT(*) AS count,
        ROUND((COUNT(*) * 100.0 / ${totalCountSub}), 1) AS percentage
      FROM patients p
      ${whereClause ? whereClause : ""}
      WHERE age IS NOT NULL
      GROUP BY age_group
      ORDER BY age_group
    `;

    const educationQuery = `
      SELECT 
        COALESCE(highest_education_level, 'Not Specified') as education_level,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / ${totalCountSub}), 1) AS percentage
      FROM patients p
      ${whereClause ? whereClause : ""}
      GROUP BY highest_education_level
      ORDER BY count DESC
    `;

    const employmentQuery = `
      SELECT 
        COALESCE(employment_status, 'Not Specified') as employment_status,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / ${totalCountSub}), 1) AS percentage
      FROM patients p
      ${whereClause ? whereClause : ""}
      GROUP BY employment_status
      ORDER BY count DESC
    `;

    const [ageDistribution, educationLevels, employmentStatus] =
      await Promise.all([
        db.query(ageDistributionQuery, params),
        db.query(educationQuery, params),
        db.query(employmentQuery, params),
      ]);

    const output = {
      age_distribution: ageDistribution.rows,
      education_levels: educationLevels.rows,
      employment_status: employmentStatus.rows,
    };

    if (isHandler) {
      return res.json({
        demographics: output,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Demographic analytics retrieved successfully",
      });
    }

    return output;
  }

  static async getMedicalAnalytics(a = "", b = []) {
    let whereClause = a;
    let params = b;
    let isHandler = false;
    let req = null;
    let res = null;

    if (a && a.query && b && typeof b.json === "function") {
      req = a;
      res = b;
      const filterParams = dashboardController.buildFilterParams(req.query);
      whereClause = filterParams.whereClause;
      params = filterParams.params;
      isHandler = true;
    }

    const totalCountSub = `(SELECT COUNT(*) FROM phase1_registration_section prs JOIN patients p ON prs.patient_id = p.patient_id ${
      whereClause ? whereClause : ""
    })`;

    const causesQuery = `
      SELECT 
        TRIM(unnest(hearing_loss_causes)) AS cause, 
        COUNT(*) AS count,
        ROUND((COUNT(*) * 100.0 / ${totalCountSub}), 1) AS percentage
      FROM phase1_registration_section prs
      JOIN patients p ON prs.patient_id = p.patient_id
      ${whereClause ? whereClause : ""}
      WHERE hearing_loss_causes IS NOT NULL
      GROUP BY cause
      ORDER BY count DESC
      LIMIT 10
    `;

    const treatmentOutcomesQuery = `
      SELECT 
        ph.phase_name,
        COUNT(*) as total_patients,
        SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN pp.status ILIKE 'Ongoing' THEN 1 ELSE 0 END) as ongoing,
        SUM(CASE WHEN pp.status ILIKE 'Pending' THEN 1 ELSE 0 END) as pending,
        ROUND((SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0)), 1) as completion_rate
      FROM patient_phases pp
      JOIN phases ph ON pp.phase_id = ph.phase_id
      JOIN patients p ON pp.patient_id = p.patient_id
      ${whereClause ? whereClause : ""}
      GROUP BY ph.phase_name, ph.phase_id
      ORDER BY ph.phase_id
    `;

    const hearingAidUsageQuery = `
      SELECT 
        number_of_hearing_aid,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM fitting f JOIN patients p ON f.patient_id = p.patient_id ${
          whereClause ? whereClause : ""
        })), 1) AS percentage
      FROM fitting f
      JOIN patients p ON f.patient_id = p.patient_id
      ${whereClause ? whereClause : ""}
      WHERE number_of_hearing_aid IS NOT NULL
      GROUP BY number_of_hearing_aid
      ORDER BY number_of_hearing_aid
    `;

    const [causes, outcomes, hearingAidUsage] = await Promise.all([
      db.query(causesQuery, params),
      db.query(treatmentOutcomesQuery, params),
      db.query(hearingAidUsageQuery, params),
    ]);

    const output = {
      hearing_loss_causes: causes.rows,
      treatment_outcomes: outcomes.rows,
      hearing_aid_usage: hearingAidUsage.rows,
    };

    if (isHandler) {
      return res.json({
        medical_analytics: output,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Medical analytics retrieved successfully",
      });
    }

    return output;
  }

  static async getGeographicAnalytics(a = "", b = []) {
    let whereClause = a;
    let params = b;
    let isHandler = false;
    let req = null;
    let res = null;

    if (a && a.query && b && typeof b.json === "function") {
      req = a;
      res = b;
      const filterParams = dashboardController.buildFilterParams(req.query);
      whereClause = filterParams.whereClause;
      params = filterParams.params;
      isHandler = true;
    }

    const totalCountSub = `(SELECT COUNT(*) FROM patients p ${
      whereClause ? whereClause : ""
    })`;

    const regionDistributionQuery = `
      SELECT 
        COALESCE(region_district, 'Not Specified') as region,
        COUNT(*)::int AS patient_count,
        ROUND((COUNT(*) * 100.0 / ${totalCountSub}), 1) AS percentage
      FROM patients p
      ${whereClause ? whereClause : ""}
      GROUP BY region_district
      ORDER BY patient_count DESC
    `;

    const cityDistributionQuery = `
      SELECT 
        COALESCE(city_village, 'Not Specified') as city,
        COUNT(*)::int AS patient_count,
        ROUND((COUNT(*) * 100.0 / ${totalCountSub}), 1) AS percentage
      FROM patients p
      ${whereClause ? whereClause : ""}
      GROUP BY city_village
      ORDER BY patient_count DESC
      LIMIT 20
    `;

    const missionPerformanceQuery = `
      SELECT 
        p.city_village as mission_location,
        COUNT(*) as total_patients,
        COUNT(DISTINCT CASE WHEN pp.status ILIKE 'Completed' THEN pp.patient_id END) as completed_patients,
        ROUND((COUNT(DISTINCT CASE WHEN pp.status ILIKE 'Completed' THEN pp.patient_id END) * 100.0 / NULLIF(COUNT(*),0)), 1) as success_rate
      FROM patients p
      LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id
      ${whereClause ? whereClause : ""}
      GROUP BY p.city_village
      HAVING COUNT(*) >= 5
      ORDER BY success_rate DESC
      LIMIT 15
    `;

    const [regions, cities, missionPerformance] = await Promise.all([
      db.query(regionDistributionQuery, params),
      db.query(cityDistributionQuery, params),
      db.query(missionPerformanceQuery, params),
    ]);

    const output = {
      regional_distribution: regions.rows,
      city_distribution: cities.rows,
      mission_performance: missionPerformance.rows,
    };

    if (isHandler) {
      return res.json({
        geographic_distribution: output,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Geographic analytics retrieved successfully",
      });
    }

    return output;
  }

  static async getPerformanceAnalytics(a = "", b = []) {
    let whereClause = a;
    let params = b;
    let isHandler = false;
    let req = null;
    let res = null;

    if (a && a.query && b && typeof b.json === "function") {
      req = a;
      res = b;
      const filterParams = dashboardController.buildFilterParams(req.query);
      whereClause = filterParams.whereClause;
      params = filterParams.params;
      isHandler = true;
    }

    const phasePerformanceQuery = `
      SELECT 
        p.phase_name,
        COUNT(DISTINCT pp.patient_id) AS patients_served,
        SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN pp.status ILIKE 'Ongoing' THEN 1 ELSE 0 END) AS ongoing,
        ROUND(
          (SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END)::decimal /
          NULLIF(COUNT(pp.patient_id), 0)) * 100, 1
        ) AS success_rate,
        AVG(EXTRACT(epoch FROM (pp.phase_end_date::timestamp - pp.phase_start_date::timestamp)) / 86400.0) as avg_duration_days
      FROM patient_phases pp
      JOIN phases p ON p.phase_id = pp.phase_id
      JOIN patients pt ON pp.patient_id = pt.patient_id
      ${whereClause ? whereClause : ""}
      GROUP BY p.phase_name, p.phase_id
      ORDER BY p.phase_id
    `;

    const monthlyPerformanceQuery = `
      SELECT 
        DATE_TRUNC('month', pp.phase_start_date) as month,
        p.phase_name,
        COUNT(*) as total_cases,
        SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) as completed_cases,
        ROUND((SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0)), 1) as completion_rate
      FROM patient_phases pp
      JOIN phases p ON pp.phase_id = p.phase_id
      JOIN patients pt ON pp.patient_id = pt.patient_id
      ${whereClause ? whereClause : ""}
      WHERE pp.phase_start_date IS NOT NULL
      GROUP BY month, p.phase_name, p.phase_id
      ORDER BY month, p.phase_id
    `;

    const [phasePerformance, monthlyPerformance] = await Promise.all([
      db.query(phasePerformanceQuery, params),
      db.query(monthlyPerformanceQuery, params),
    ]);

    const output = {
      phase_performance: phasePerformance.rows,
      monthly_trends: monthlyPerformance.rows,
    };

    if (isHandler) {
      return res.json({
        performance_metrics: output,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Performance analytics retrieved successfully",
      });
    }

    return output;
  }

  static async getPhaseProgressAnalytics(a = "", b = []) {
    let whereClause = a;
    let params = b;
    let isHandler = false;
    let req = null;
    let res = null;

    if (a && a.query && b && typeof b.json === "function") {
      req = a;
      res = b;
      const filterParams = dashboardController.buildFilterParams(req.query);
      whereClause = filterParams.whereClause;
      params = filterParams.params;
      isHandler = true;
    }

    const progressQuery = `
      WITH phase_progress AS (
        SELECT 
          pt.patient_id,
          COUNT(pp.phase_id) as total_phases,
          SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) as completed_phases,
          CASE 
            WHEN SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) = 3 THEN 'All Phases Completed'
            WHEN SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) = 2 THEN 'Two Phases Completed'
            WHEN SUM(CASE WHEN pp.status ILIKE 'Completed' THEN 1 ELSE 0 END) = 1 THEN 'One Phase Completed'
            ELSE 'No Phases Completed'
          END as progress_category
        FROM patients pt
        LEFT JOIN patient_phases pp ON pt.patient_id = pp.patient_id
        ${whereClause ? whereClause : ""}
        GROUP BY pt.patient_id
      )
      SELECT 
        progress_category,
        COUNT(*) as patient_count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM patients p ${
          whereClause ? whereClause : ""
        })), 1) as percentage
      FROM phase_progress
      GROUP BY progress_category
      ORDER BY 
        CASE progress_category
          WHEN 'All Phases Completed' THEN 1
          WHEN 'Two Phases Completed' THEN 2
          WHEN 'One Phase Completed' THEN 3
          ELSE 4
        END
    `;

    const result = await db.query(progressQuery, params);

    if (isHandler) {
      return res.json({
        phase_progress: result.rows,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Phase progress analytics retrieved successfully",
      });
    }

    return result.rows;
  }

  static async getTimeSeriesAnalytics(a = "", b = []) {
    let whereClause = a;
    let params = b;
    let isHandler = false;
    let req = null;
    let res = null;

    if (a && a.query && b && typeof b.json === "function") {
      req = a;
      res = b;
      const filterParams = dashboardController.buildFilterParams(req.query);
      whereClause = filterParams.whereClause;
      params = filterParams.params;
      isHandler = true;
    }

    const dailyRegistrationsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_patients,
        SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) as cumulative_patients
      FROM patients p
      ${whereClause ? whereClause : ""}
      WHERE created_at IS NOT NULL
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    const monthlyMetricsQuery = `
      SELECT 
        DATE_TRUNC('month', p.created_at) as month,
        COUNT(DISTINCT p.patient_id) as new_patients,
        COUNT(DISTINCT f.patient_id) as new_fittings,
        COUNT(DISTINCT CASE WHEN pp.status ILIKE 'Completed' THEN pp.patient_id END) as completed_phases
      FROM patients p
      LEFT JOIN fitting f ON p.patient_id = f.patient_id
      LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id
      ${whereClause ? whereClause : ""}
      WHERE p.created_at IS NOT NULL
      GROUP BY DATE_TRUNC('month', p.created_at)
      ORDER BY month
    `;

    const [dailyRegistrations, monthlyMetrics] = await Promise.all([
      db.query(dailyRegistrationsQuery, params),
      db.query(monthlyMetricsQuery, params),
    ]);

    const output = {
      daily_registrations: dailyRegistrations.rows,
      monthly_metrics: monthlyMetrics.rows,
    };

    if (isHandler) {
      return res.json({
        time_series: output,
        filters_applied: dashboardController.getAppliedFilters(req.query),
        message: "Time series analytics retrieved successfully",
      });
    }

    return output;
  }

  static async getFilterOptions(req, res) {
    try {
      const [regions, cities, genders, phases] = await Promise.all([
        db.query(
          `SELECT DISTINCT region_district as value FROM patients WHERE region_district IS NOT NULL ORDER BY region_district`
        ),
        db.query(
          `SELECT DISTINCT city_village as value FROM patients WHERE city_village IS NOT NULL ORDER BY city_village`
        ),
        db.query(
          `SELECT DISTINCT gender as value FROM patients WHERE gender IS NOT NULL ORDER BY gender`
        ),
        db.query(
          `SELECT phase_id as value, phase_name as label FROM phases ORDER BY phase_id`
        ),
      ]);

      res.json({
        regions: regions.rows,
        cities: cities.rows,
        genders: genders.rows,
        phases: phases.rows,
        age_ranges: [
          { value: "0-18", label: "0-18 years" },
          { value: "19-35", label: "19-35 years" },
          { value: "36-50", label: "36-50 years" },
          { value: "51-65", label: "51-65 years" },
          { value: "65-100", label: "65+ years" },
        ],
      });
    } catch (error) {
      console.error("Get filter options error:", error);
      res.status(500).json({ error: "Failed to retrieve filter options" });
    }
  }

  // ===========================================================================
  // --- HELPER FUNCTIONS ---
  // ===========================================================================

  static buildFilterParams(queryParams) {
    const whereConditions = [];
    const params = [];
    let paramCount = 0;

    // simple filters that map to patient table fields
    const simpleFilters = {
      start_date: { expression: "p.created_at >= $%d" },
      end_date: { expression: "p.created_at <= $%d" },
      region: { expression: "p.region_district = $%d" },
      city: { expression: "p.city_village = $%d" },
      gender: { expression: "p.gender = $%d" },
    };

    if (queryParams.start_date) {
      paramCount += 1;
      params.push(queryParams.start_date);
      whereConditions.push(
        simpleFilters.start_date.expression.replace("%d", paramCount)
      );
    }
    if (queryParams.end_date) {
      paramCount += 1;
      const endDate = new Date(queryParams.end_date);
      endDate.setDate(endDate.getDate() + 1);
      params.push(endDate.toISOString().split('T')[0]);
      whereConditions.push(
        simpleFilters.end_date.expression.replace("%d", paramCount)
      );
    }
    if (queryParams.region) {
      paramCount += 1;
      params.push(queryParams.region);
      whereConditions.push(
        simpleFilters.region.expression.replace("%d", paramCount)
      );
    }
    if (queryParams.city) {
      paramCount += 1;
      params.push(queryParams.city);
      whereConditions.push(
        simpleFilters.city.expression.replace("%d", paramCount)
      );
    }
    if (queryParams.gender) {
      paramCount += 1;
      params.push(queryParams.gender);
      whereConditions.push(
        simpleFilters.gender.expression.replace("%d", paramCount)
      );
    }

    if (queryParams.age_range) {
      const parts = queryParams.age_range.split("-").map((p) => p.trim());
      const minAge = Number(parts[0]);
      const maxAge = Number(parts[1]);
      if (!isNaN(minAge) && !isNaN(maxAge)) {
        paramCount += 1;
        params.push(minAge);
        paramCount += 1;
        params.push(maxAge);
        whereConditions.push(
          `p.age BETWEEN $${paramCount - 1} AND $${paramCount}`
        );
      }
    }

    if (queryParams.phase_id) {
      paramCount += 1;
      params.push(queryParams.phase_id);
      whereConditions.push(
        `EXISTS (SELECT 1 FROM patient_phases pp WHERE pp.patient_id = p.patient_id AND pp.phase_id = $${paramCount})`
      );
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    return { whereClause, params };
  }

  static getAppliedFilters(queryParams) {
    const applied = {};
    const filterFields = [
      "start_date",
      "end_date",
      "region",
      "city",
      "gender",
      "age_range",
      "phase_id",
    ];

    filterFields.forEach((field) => {
      if (queryParams[field]) {
        applied[field] = queryParams[field];
      }
    });

    return applied;
  }

  static calculateGrowthRate(monthlyData) {
    if (!monthlyData || monthlyData.length < 2) return 0;

    const last = monthlyData[monthlyData.length - 1];
    const prev = monthlyData[monthlyData.length - 2];

    const recent = parseFloat(last.patient_count ?? last.new_patients ?? 0);
    const previous = parseFloat(prev.patient_count ?? prev.new_patients ?? 0);

    if (previous === 0) {
        return recent > 0 ? 100.0 : 0;
    }

    return (((recent - previous) / previous) * 100).toFixed(1);
  }
}

module.exports = dashboardController;