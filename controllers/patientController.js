const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

class PatientController {
static async findPatientIdByShf(req, res) {
  try {
    const { shf } = req.query;
    if (!shf) {
      return res.status(400).json({ error: "Missing 'shf' query parameter" });
    }

    let resDb;

    // Check if this is a numeric SHF ID (contains only numbers after SHF prefix)
    // This will match: PH-SHF123, SHF456, but NOT SHF-abc123
    const numericMatch = shf.match(/^(?:PH-)?SHF(\d+)$/i);
    if (numericMatch) {
      const numericValue = numericMatch[1];
      const query = `
        SELECT patient_id, last_name, first_name, date_of_birth,age, gender, mobile_number, employment_status, highest_education_level
        FROM patients
        WHERE REPLACE(REPLACE(shf_id, 'PH-SHF', ''), 'SHF', '')::INT = $1::INT
        LIMIT 1
      `;
      resDb = await db.query(query, [numericValue]);
    } else {
      // For non-numeric SHF IDs (like SHF-uxYW0ytZWs), do exact match
      const query = `
        SELECT patient_id
        FROM patients
        WHERE shf_id = $1
        LIMIT 1
      `;
      resDb = await db.query(query, [shf]);
    }

    if (resDb.rows.length === 0) {
      return res.status(404).json({ error: `Patient not found for shf_id: ${shf}` });
    }

    res.json ({ 
      patient_id: resDb.rows[0].patient_id,
      last_name: resDb.rows[0].last_name,
      first_name: resDb.rows[0].first_name,
      date_of_birth: resDb.rows[0].date_of_birth,
      age: resDb.rows[0].age,
      gender: resDb.rows[0].gender,
      mobile_number: resDb.rows[0].mobile_number,
      employment_status: resDb.rows[0].employment_status,
      highest_education_level: resDb.rows[0].highest_education_level
    });
  } catch (err) {
    console.error("Error resolving SHF ID:", err);
    res.status(500).json({ error: err.message });
  }
}


  static async createPatient(req, res) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // Whitelist allowed columns to prevent invalid column names
      const allowedColumns = [
        'shf_id', 'last_name', 'first_name', 'gender', 'date_of_birth', 'age',
        'mobile_number', 'mobile_sms', 'alternative_number', 'alternative_sms',
        'region_district', 'city_village', 'highest_education_level', 'employment_status',
        'school_name', 'school_phone_number', 'is_student', 'user_id'
      ];

      let patientData = Object.keys(req.body)
        .filter(key => allowedColumns.includes(key))
        .reduce((obj, key) => {
          obj[key] = req.body[key];
          return obj;
        }, {});

      // Always set user_id from the authenticated user
      patientData.user_id = req.user.user_id;

      // Ensure boolean fields are booleans
      if (typeof patientData.mobile_sms !== "boolean") patientData.mobile_sms = !!patientData.mobile_sms;
      if (typeof patientData.alternative_sms !== "boolean") patientData.alternative_sms = !!patientData.alternative_sms;
      if (typeof patientData.is_student !== "boolean") patientData.is_student = !!patientData.is_student;

      // Sanitize age to ensure it's a valid integer or null
      if (patientData.age !== undefined) {
        const ageNum = parseInt(patientData.age, 10);
        patientData.age = isNaN(ageNum) ? null : ageNum;
      }

      // Remove undefined or empty string/null fields
      Object.keys(patientData).forEach((key) => {
        if (
          patientData[key] === undefined ||
          patientData[key] === null ||
          (typeof patientData[key] === "string" && patientData[key].trim() === "")
        ) {
          delete patientData[key];
        }
      });

      // Generate SHF ID if not provided
      if (!patientData.shf_id) {
        const result = await client.query(`
        SELECT MAX(CAST(SUBSTRING(shf_id FROM 7) AS INTEGER)) AS max_id 
        FROM patients 
        WHERE shf_id ~ '^PH-SHF[0-9]+$'
      `);

        let nextId = 1;
        if (result.rows[0].max_id) {
          nextId = result.rows[0].max_id + 1;
        }
        patientData.shf_id = `PH-SHF${String(nextId).padStart(4, "0")}`;
      }

      // Defensive: Ensure there is at least one column to insert
      const keys = Object.keys(patientData);
      if (keys.length === 0) {
        throw new Error("No patient data provided");
      }

      const columns = keys.join(", ");
      const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
      const values = keys.map((k) => patientData[k]);

      // Debug log (optional, remove in production)
      // console.log("INSERT INTO patients (" + columns + ") VALUES (" + placeholders + ")", values);

      const query = `
      INSERT INTO patients (${columns})
      VALUES (${placeholders})
      RETURNING patient_id, shf_id
    `;

      const result = await client.query(query, values);
      const patient = result.rows[0];

      // Create initial phase entry for Phase 1
      await client.query(
        "INSERT INTO patient_phases (patient_id, phase_id, phase_start_date, status, completed_by_user_id) VALUES ($1, $2, CURRENT_DATE, $3, $4)",
        [patient.patient_id, 1, "In Progress", req.user.user_id]
      );

      // Log patient creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["patients", patient.patient_id, "CREATE", JSON.stringify(patientData), req.user.user_id]
      );

      await client.query("COMMIT");

      return ResponseHandler.success(res, patient, "Patient created successfully", 201);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Create patient error:", error);
      return ResponseHandler.error(res, "Failed to create patient: " + error.message);
    } finally {
      client.release();
    }
  }

  // PatientController (Partial - Focus on getPatients and getPatientById)

  // controller
  static async getPatients(req, res) {
    try {
      const { page = 1, limit = 40, search, city, country, phase_id, status } = req.query;
      const offset = (page - 1) * limit;

      let query = `
      SELECT DISTINCT ON (p.patient_id)
        p.*, 
        pp.phase_id, pp.status as phase_status, ph.phase_name,
        pp.phase_start_date, pp.phase_end_date
      FROM patients p
      LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id
      LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
    `;

      const conditions = [];
      const params = [];

      // Filtering by user role
      if (req.user && req.user.roles) {
        if (req.user.roles.includes("City Coordinator")) {
          conditions.push(`p.user_id = $${params.length + 1}`);
          params.push(req.user.user_id);
        }
        // For admin/country_coordinator, do not filter by user_id
      }

      if (search) {
        conditions.push(`(p.first_name ILIKE $${params.length + 1} OR p.last_name ILIKE $${params.length + 1} OR p.shf_id ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
      }

      if (city) {
        conditions.push(`p.city_village = $${params.length + 1}`);
        params.push(city);
      }

      if (country) {
        conditions.push(`p.region_district = $${params.length + 1}`);
        params.push(country);
      }

      if (phase_id) {
        conditions.push(`pp.phase_id = $${params.length + 1}`);
        params.push(phase_id);
      }

      if (status) {
        conditions.push(`pp.status = $${params.length + 1}`);
        params.push(status);
      }

      if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;

      query += ` ORDER BY p.patient_id, pp.phase_start_date DESC, pp.phase_id DESC, p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return ResponseHandler.success(res, result.rows, "Patients retrieved successfully");
    } catch (error) {
      console.error("Get patients error:", error);
      return ResponseHandler.error(res, "Failed to retrieve patients");
    }
  }


  // ----------------------------------------------------------------------------------

static async getPatientById(req, res) {
    try {
        const { patientId } = req.params;

        // ✅ Clean SQL query — no hidden spaces, no leading newline
        const query = `SELECT 
            p.*,
            COALESCE(
              array_agg(
                json_build_object(
                  'phase_id', pp.phase_id,
                  'phase_name', ph.phase_name,
                  'status', pp.status,
                  'start_date', pp.phase_start_date,
                  'end_date', pp.phase_end_date,
                  'completed_by', u.username
                )
              ) FILTER (WHERE pp.phase_id IS NOT NULL),
              ARRAY[]::json[]
            ) AS phases
          FROM patients p
          LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id
          LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
          LEFT JOIN users u ON pp.completed_by_user_id = u.user_id
          WHERE p.patient_id = $1
          GROUP BY p.patient_id;`;

        // 👇 ERROR FIXED: Changed 'cleanQuery' to 'query'
        const result = await db.query(query, [patientId]);

        if (result.rows.length === 0) {
            return ResponseHandler.notFound(res, "Patient not found");
        }

        const patient = result.rows[0];

        // ✅ Ensure `phases` is always a proper array
        patient.phases = Array.isArray(patient.phases)
            ? patient.phases.filter(
                  (phase) => phase && phase.phase_id !== null
                )
            : [];

        return ResponseHandler.success(res, patient, "Patient retrieved successfully");
    } catch (error) {
        console.error("Get patient error:", error);
        return ResponseHandler.error(res, "Failed to retrieve patient");
    }
}
  
  static async updatePatient(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { patientId } = req.params
      const updateData = req.body

      // Get current patient data for audit
      const currentResult = await client.query("SELECT * FROM patients WHERE patient_id = $1", [patientId])

      if (currentResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Patient not found")
      }

      const currentData = currentResult.rows[0]

      // Build update query
      const updateFields = Object.keys(updateData)
      const setClause = updateFields.map((field, index) => `${field} = $${index + 2}`).join(", ")
      const values = [patientId, ...Object.values(updateData)]

      const updateQuery = `
        UPDATE patients 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE patient_id = $1
        RETURNING *
      `

      const result = await client.query(updateQuery, values)

      // Log patient update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "patients",
          patientId,
          "UPDATE",
          JSON.stringify(currentData),
          JSON.stringify(result.rows[0]),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "Patient updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update patient error:", error)
      return ResponseHandler.error(res, "Failed to update patient")
    } finally {
      client.release()
    }
  }

  static async advancePatientPhase(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { patientId } = req.params
      const { next_phase_id } = req.body

      // Validate next phase
      if (![2, 3].includes(next_phase_id)) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Invalid phase ID", 400)
      }

      // Check if patient exists
      const patientResult = await client.query("SELECT * FROM patients WHERE patient_id = $1", [patientId])
      if (patientResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Patient not found")
      }

      // Check if previous phase is completed
      const previousPhase = next_phase_id - 1
      const previousPhaseResult = await client.query(
        "SELECT * FROM patient_phases WHERE patient_id = $1 AND phase_id = $2 AND status = 'Completed'",
        [patientId, previousPhase]
      )

      if (previousPhaseResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, `Phase ${previousPhase} must be completed before advancing to Phase ${next_phase_id}`, 400)
      }

      // Check if next phase already exists
      const existingPhaseResult = await client.query(
        "SELECT * FROM patient_phases WHERE patient_id = $1 AND phase_id = $2",
        [patientId, next_phase_id]
      )

      if (existingPhaseResult.rows.length > 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, `Patient is already in Phase ${next_phase_id}`, 400)
      }

      // Create new phase entry
      const result = await client.query(
        "INSERT INTO patient_phases (patient_id, phase_id, phase_start_date, status) VALUES ($1, $2, CURRENT_DATE, $3) RETURNING *",
        [patientId, next_phase_id, "In Progress"]
      )

      // Log phase advancement
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["patient_phases", result.rows[0].patient_phase_id, "PHASE_ADVANCE", JSON.stringify(result.rows[0]), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], `Patient advanced to Phase ${next_phase_id} successfully`)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Advance patient phase error:", error)
      return ResponseHandler.error(res, "Failed to advance patient phase")
    } finally {
      client.release()
    }
  }

  static async getPatientsByPhase(req, res) {
    try {
      const { phaseId } = req.params
      const { page = 1, limit = 10, status = "In Progress" } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT p.*, pp.status as phase_status, pp.phase_start_date, pp.phase_end_date,
               ph.phase_name, u.username as completed_by
        FROM patients p
        INNER JOIN patient_phases pp ON p.patient_id = pp.patient_id
        LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
        LEFT JOIN users u ON pp.completed_by_user_id = u.user_id
        WHERE pp.phase_id = $1
      `

      const params = [phaseId]

      if (status) {
        query += ` AND pp.status = $${params.length + 1}`
        params.push(status)
      }

      // Apply location-based filtering for non-admin users
      if (!req.user.roles.includes("admin")) {
        if (req.user.roles.includes("city_coordinator")) {
          const userCities = req.user.locations.filter((loc) => loc.city_id).map((loc) => loc.city_name)

          if (userCities.length > 0) {
            query += ` AND p.city_village = ANY($${params.length + 1})`
            params.push(userCities)
          }
        } else if (req.user.roles.includes("country_coordinator")) {
          const userCountries = req.user.locations.filter((loc) => loc.country_id).map((loc) => loc.country_name)

          if (userCountries.length > 0) {
            query += ` AND p.region_district = ANY($${params.length + 1})`
            params.push(userCountries)
          }
        }
      }

      query += ` ORDER BY pp.phase_start_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, `Patients in Phase ${phaseId} retrieved successfully`)
    } catch (error) {
      console.error("Get patients by phase error:", error)
      return ResponseHandler.error(res, "Failed to retrieve patients by phase")
    }
  }
}

module.exports = PatientController
