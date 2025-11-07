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

  static async getPatientFullReport(req, res) {
    try {
      const patientId = Number(req.params.patientId)
      if (!patientId || isNaN(patientId)) {
        return ResponseHandler.error(res, "Invalid patient ID", 400)
      }

      // Base patient (demographics + latest phase info if present)
      const basePatientRes = await db.query(
        `
        SELECT DISTINCT ON (p.patient_id)
          p.*,
          pp.phase_id, pp.status as phase_status, ph.phase_name,
          pp.phase_start_date, pp.phase_end_date
        FROM patients p
        LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id
        LEFT JOIN phases ph ON pp.phase_id = ph.phase_id
        WHERE p.patient_id = $1
        ORDER BY p.patient_id, pp.phase_start_date DESC NULLS LAST, pp.phase_id DESC NULLS LAST, p.created_at DESC
        `,
        [patientId],
      )

      if (basePatientRes.rows.length === 0) {
        return ResponseHandler.notFound(res, "Patient not found")
      }

      const patient = basePatientRes.rows[0]

      // Phase 1 snapshot (latest of each related record)
      const phase1Res = await db.query(
        `
        SELECT
          p.patient_id, p.shf_id, p.first_name, p.last_name, p.gender, p.date_of_birth,
          pp.phase_id, pp.status, pp.phase_start_date, pp.phase_end_date,
          -- Registration
          p1.registration_date        AS p1_registration_date,
          p1.city                     AS p1_city,
          p1.has_hearing_loss         AS p1_has_hearing_loss,
          p1.uses_sign_language       AS p1_uses_sign_language,
          p1.uses_speech              AS p1_uses_speech,
          p1.hearing_loss_causes      AS p1_hearing_loss_causes,
          p1.ringing_sensation        AS p1_ringing_sensation,
          p1.ear_pain                 AS p1_ear_pain,
          p1.hearing_satisfaction_18_plus AS p1_hearing_satisfaction_18_plus,
          p1.conversation_difficulty  AS p1_conversation_difficulty,
          -- Ear screening
          es1.ears_clear              AS p1_es_ears_clear,
          es1.otc_wax                 AS p1_es_otc_wax,
          es1.otc_infection           AS p1_es_otc_infection,
          es1.otc_perforation         AS p1_es_otc_perforation,
          es1.otc_tinnitus            AS p1_es_otc_tinnitus,
          es1.otc_atresia             AS p1_es_otc_atresia,
          es1.otc_implant             AS p1_es_otc_implant,
          es1.otc_other               AS p1_es_otc_other,
          es1.medical_recommendation  AS p1_es_medical_recommendation,
          es1.medication_given        AS p1_es_medication_given,
          es1.left_ear_clear_for_fitting AS p1_es_left_clear_for_fitting,
          es1.right_ear_clear_for_fitting AS p1_es_right_clear_for_fitting,
          es1.comments                AS p1_es_comments,
          -- Hearing screening
          hs1.screening_method        AS p1_hs_method,
          hs1.left_ear_result         AS p1_hs_left_result,
          hs1.right_ear_result        AS p1_hs_right_result,
          hs1.hearing_satisfaction_18_plus_pass AS p1_hs_satisfaction_pass,
          -- Ear impressions
          ei.ear_impression           AS p1_ear_impression,
          ei.comment                  AS p1_ear_impression_comment,
          -- Final QC
          q1.ear_impressions_inspected_collected AS p1_qc_impressions_collected,
          q1.shf_id_number_id_card_given         AS p1_qc_id_card_given
        FROM patients p
        LEFT JOIN patient_phases pp 
          ON p.patient_id = pp.patient_id AND pp.phase_id = 1
        LEFT JOIN LATERAL (
          SELECT r.*
          FROM phase1_registration_section r
          WHERE r.patient_id = p.patient_id AND r.phase_id = 1
          ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST
          LIMIT 1
        ) p1 ON TRUE
        LEFT JOIN LATERAL (
          SELECT es.*
          FROM ear_screening es
          WHERE es.patient_id = p.patient_id AND es.phase_id = 1
          ORDER BY es.updated_at DESC NULLS LAST, es.created_at DESC NULLS LAST
          LIMIT 1
        ) es1 ON TRUE
        LEFT JOIN LATERAL (
          SELECT hs.*
          FROM hearing_screening hs
          WHERE hs.patient_id = p.patient_id AND hs.phase_id = 1
          ORDER BY hs.updated_at DESC NULLS LAST, hs.created_at DESC NULLS LAST
          LIMIT 1
        ) hs1 ON TRUE
        LEFT JOIN LATERAL (
          SELECT ei.*
          FROM ear_impressions ei
          WHERE ei.patient_id = p.patient_id AND ei.phase_id = 1
          ORDER BY ei.updated_at DESC NULLS LAST, ei.created_at DESC NULLS LAST
          LIMIT 1
        ) ei ON TRUE
        LEFT JOIN LATERAL (
          SELECT q.*
          FROM final_qc_p1 q
          WHERE q.patient_id = p.patient_id AND q.phase_id = 1
          ORDER BY q.updated_at DESC NULLS LAST, q.created_at DESC NULLS LAST
          LIMIT 1
        ) q1 ON TRUE
        WHERE p.patient_id = $1
        LIMIT 1
        `,
        [patientId],
      )

      // Phase 2 snapshot (latest)
      const phase2Res = await db.query(
        `
        SELECT
          p.patient_id, p.shf_id, p.first_name, p.last_name, p.gender, p.date_of_birth,
          pp.phase_id, pp.status, pp.phase_start_date, pp.phase_end_date,
          -- Registration
          p2.registration_date        AS p2_registration_date,
          p2.city                     AS p2_city,
          p2.patient_type             AS p2_patient_type,
          -- Fitting table
          ft.fitting_left_power_level   AS p2_ft_left_power_level,
          ft.fitting_left_volume        AS p2_ft_left_volume,
          ft.fitting_left_model         AS p2_ft_left_model,
          ft.fitting_left_battery       AS p2_ft_left_battery,
          ft.fitting_left_earmold       AS p2_ft_left_earmold,
          ft.fitting_right_power_level  AS p2_ft_right_power_level,
          ft.fitting_right_volume       AS p2_ft_right_volume,
          ft.fitting_right_model        AS p2_ft_right_model,
          ft.fitting_right_battery      AS p2_ft_right_battery,
          ft.fitting_right_earmold      AS p2_ft_right_earmold,
          -- Fitting
          f2.number_of_hearing_aid      AS p2_f_number_of_hearing_aid,
          f2.special_device             AS p2_f_special_device,
          f2.normal_hearing             AS p2_f_normal_hearing,
          f2.distortion                 AS p2_f_distortion,
          f2.implant                    AS p2_f_implant,
          f2.recruitment                AS p2_f_recruitment,
          f2.no_response                AS p2_f_no_response,
          f2.other                      AS p2_f_other,
          f2.comment                    AS p2_f_comment,
          f2.clear_for_counseling       AS p2_f_clear_for_counseling,
          -- Counseling
          c2.received_aftercare_information AS p2_c_received_aftercare_info,
          c2.trained_as_student_ambassador  AS p2_c_trained_student_amb,
          -- Final QC
          q2.batteries_provided_13      AS p2_qc_batt_13,
          q2.batteries_provided_675     AS p2_qc_batt_675,
          q2.hearing_aid_satisfaction_18_plus AS p2_qc_satisfaction_18_plus,
          q2.confirmation               AS p2_qc_confirmation,
          q2.qc_comments                AS p2_qc_comments,
          -- Ear screening (phase 2 otoscopy)
          es2.ears_clear                AS p2_es_ears_clear,
          es2.otc_wax                   AS p2_es_otc_wax,
          es2.otc_infection             AS p2_es_otc_infection,
          es2.otc_perforation           AS p2_es_otc_perforation,
          es2.otc_tinnitus              AS p2_es_otc_tinnitus,
          es2.otc_atresia               AS p2_es_otc_atresia,
          es2.otc_implant               AS p2_es_otc_implant,
          es2.otc_other                 AS p2_es_otc_other,
          es2.medical_recommendation    AS p2_es_medical_recommendation,
          es2.medication_given          AS p2_es_medication_given,
          -- Hearing screening
          hs2.screening_method          AS p2_hs_method,
          hs2.left_ear_result           AS p2_hs_left_result,
          hs2.right_ear_result          AS p2_hs_right_result,
          hs2.hearing_satisfaction_18_plus_pass AS p2_hs_satisfaction_pass
        FROM patients p
        LEFT JOIN patient_phases pp 
          ON p.patient_id = pp.patient_id AND pp.phase_id = 2
        LEFT JOIN LATERAL (
          SELECT r.*
          FROM phase2_registration_section r
          WHERE r.patient_id = p.patient_id AND r.phase_id = 2
          ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST
          LIMIT 1
        ) p2 ON TRUE
        LEFT JOIN LATERAL (
          SELECT ft0.*
          FROM fitting_table ft0
          WHERE ft0.patient_id = p.patient_id AND ft0.phase_id = 2
          ORDER BY ft0.updated_at DESC NULLS LAST, ft0.created_at DESC NULLS LAST
          LIMIT 1
        ) ft ON TRUE
        LEFT JOIN LATERAL (
          SELECT f.*
          FROM fitting f
          WHERE f.patient_id = p.patient_id AND f.phase_id = 2
          ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC NULLS LAST
          LIMIT 1
        ) f2 ON TRUE
        LEFT JOIN LATERAL (
          SELECT c.*
          FROM counseling c
          WHERE c.patient_id = p.patient_id AND c.phase_id = 2
          ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
          LIMIT 1
        ) c2 ON TRUE
        LEFT JOIN LATERAL (
          SELECT q.*
          FROM final_qc_p2 q
          WHERE q.patient_id = p.patient_id AND q.phase_id = 2
          ORDER BY q.updated_at DESC NULLS LAST, q.created_at DESC NULLS LAST
          LIMIT 1
        ) q2 ON TRUE
        LEFT JOIN LATERAL (
          SELECT es.*
          FROM ear_screening es
          WHERE es.patient_id = p.patient_id AND es.phase_id = 2
          ORDER BY es.updated_at DESC NULLS LAST, es.created_at DESC NULLS LAST
          LIMIT 1
        ) es2 ON TRUE
        LEFT JOIN LATERAL (
          SELECT hs.*
          FROM hearing_screening hs
          WHERE hs.patient_id = p.patient_id AND hs.phase_id = 2
          ORDER BY hs.updated_at DESC NULLS LAST, hs.created_at DESC NULLS LAST
          LIMIT 1
        ) hs2 ON TRUE
        WHERE p.patient_id = $1
        LIMIT 1
        `,
        [patientId],
      )

      // Phase 3: ALL aftercare records (each with latest related reg/otoscopy/qc at the time)
      const phase3ListRes = await db.query(
        `
        SELECT
          p.patient_id, p.shf_id, p.first_name, p.last_name, p.gender, p.date_of_birth,
          -- Aftercare assessment (base row)
          a.assessment_id,
          a.created_at AS p3_assessment_created_at,
          a.eval_hearing_aid_dead_broken AS p3_eval_aid_dead_broken,
          a.eval_hearing_aid_internal_feedback AS p3_eval_aid_internal_feedback,
          a.eval_hearing_aid_power_change_needed AS p3_eval_aid_power_change_needed,
          a.eval_hearing_aid_power_change_too_low AS p3_eval_aid_power_change_too_low,
          a.eval_hearing_aid_power_change_too_loud AS p3_eval_aid_power_change_too_loud,
          a.eval_hearing_aid_lost_stolen AS p3_eval_aid_lost_stolen,
          a.eval_hearing_aid_no_problem AS p3_eval_aid_no_problem,
          a.eval_earmold_discomfort_too_tight AS p3_eval_earmold_discomfort_too_tight,
          a.eval_earmold_feedback_too_loose AS p3_eval_earmold_feedback_too_loose,
          a.eval_earmold_damaged_tubing_cracked AS p3_eval_earmold_damaged_tubing_cracked,
          a.eval_earmold_lost_stolen AS p3_eval_earmold_lost_stolen,
          a.eval_earmold_no_problem AS p3_eval_earmold_no_problem,
          a.service_tested_wfa_demo_hearing_aids AS p3_service_tested_wfa_demo_hearing_aids,
          a.service_hearing_aid_sent_for_repair_replacement AS p3_service_sent_for_repair,
          a.service_not_benefiting_from_hearing_aid AS p3_service_not_benefiting,
          a.service_refit_new_hearing_aid AS p3_service_refit_new_aid,
          a.service_retubed_unplugged_earmold AS p3_service_retubed_unplugged_earmold,
          a.service_modified_earmold AS p3_service_modified_earmold,
          a.service_fit_stock_earmold AS p3_service_fit_stock_earmold,
          a.service_took_new_ear_impression AS p3_service_took_new_ear_impression,
          a.service_refit_custom_earmold AS p3_service_refit_custom_earmold,
          a.gs_counseling AS p3_gs_counseling,
          a.gs_batteries_provided AS p3_gs_batteries_provided,
          a.gs_batteries_13_qty AS p3_gs_batteries_13_qty,
          a.gs_batteries_675_qty AS p3_gs_batteries_675_qty,
          a.gs_refer_aftercare_service_center AS p3_gs_refer_aftercare_center,
          a.gs_refer_next_phase2_mission AS p3_gs_refer_next_phase2_mission,
          a.comment AS p3_aftercare_comment,

          -- Registration closest/latest
          r.registration_date AS p3_registration_date,
          r.country           AS p3_country,
          r.city              AS p3_city,
          r.type_of_aftercare AS p3_type_of_aftercare,
          r.service_center_school_name AS p3_service_center_school_name,
          r.return_visit_custom_earmold_repair AS p3_return_visit_custom_earmold_repair,
          r.problem_with_hearing_aid_earmold AS p3_problem_with_hearing_aid_earmold,

          -- Final QC
          q.hearing_aid_satisfaction_18_plus AS p3_qc_satisfaction_18_plus,
          q.ask_people_to_repeat_themselves AS p3_qc_ask_repeat,
          q.notes_from_shf AS p3_qc_notes,

          -- Ear screening (otoscopy)
          es.ears_clear AS p3_es_ears_clear,
          es.otc_wax AS p3_es_otc_wax,
          es.otc_infection AS p3_es_otc_infection,
          es.otc_perforation AS p3_es_otc_perforation,
          es.otc_tinnitus AS p3_es_otc_tinnitus,
          es.otc_atresia AS p3_es_otc_atresia,
          es.otc_implant AS p3_es_otc_implant,
          es.otc_other AS p3_es_otc_other,
          es.medical_recommendation AS p3_es_medical_recommendation,
          es.medication_given AS p3_es_medication_given,
          es.left_ear_clear_for_fitting AS p3_es_left_clear_for_fitting,
          es.right_ear_clear_for_fitting AS p3_es_right_clear_for_fitting,
          es.comments AS p3_es_comments
        FROM aftercare_assessment a
        JOIN patients p ON p.patient_id = a.patient_id
        LEFT JOIN LATERAL (
          SELECT r0.*
          FROM phase3_registration_section r0
          WHERE r0.patient_id = a.patient_id AND r0.phase_id = 3
          ORDER BY r0.created_at DESC NULLS LAST
          LIMIT 1
        ) r ON TRUE
        LEFT JOIN LATERAL (
          SELECT q0.*
          FROM final_qc_p3 q0
          WHERE q0.patient_id = a.patient_id AND q0.phase_id = 3
          ORDER BY q0.created_at DESC NULLS LAST
          LIMIT 1
        ) q ON TRUE
        LEFT JOIN LATERAL (
          SELECT es0.*
          FROM ear_screening es0
          WHERE es0.patient_id = a.patient_id AND es0.phase_id = 3
          ORDER BY es0.created_at DESC NULLS LAST
          LIMIT 1
        ) es ON TRUE
        WHERE a.patient_id = $1
        ORDER BY a.created_at DESC NULLS LAST, a.assessment_id DESC
        `,
        [patientId],
      )

      // Optional: also return raw arrays for Phase 3 components
      const [phase3RegsRes, phase3ESRes, phase3QCRes] = await Promise.all([
        db.query(
          `SELECT * FROM phase3_registration_section WHERE patient_id = $1 AND phase_id = 3 ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST`,
          [patientId],
        ),
        db.query(
          `SELECT * FROM ear_screening WHERE patient_id = $1 AND phase_id = 3 ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST`,
          [patientId],
        ),
        db.query(
          `SELECT * FROM final_qc_p3 WHERE patient_id = $1 AND phase_id = 3 ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST`,
          [patientId],
        ),
      ])

      const data = {
        patient,
        phase1: phase1Res.rows[0] || null,
        phase2: phase2Res.rows[0] || null,

        // NEW: all Phase 3 entries
        phase3_list: phase3ListRes.rows || [],

        // Keep latest for backward compatibility
        phase3: phase3ListRes.rows[0] || null,

        // Optional raw lists if the UI needs them
        phase3_registrations: phase3RegsRes.rows || [],
        phase3_ear_screenings: phase3ESRes.rows || [],
        phase3_qc: phase3QCRes.rows || [],
      }

      return ResponseHandler.success(res, data, "Patient full report retrieved")
    } catch (error) {
      console.error("Get patient full report error:", error)
      return ResponseHandler.error(res, "Failed to retrieve patient full report")
    }
  }
}

module.exports = PatientController
