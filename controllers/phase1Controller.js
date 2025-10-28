const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

class Phase1Controller {
  // Phase 1 Registration Section
  static async createRegistration(req, res) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      const registrationData = req.body || {};
      registrationData.completed_by_user_id = req.user?.user_id;
      registrationData.phase_id = 1;

      // Debug logs to verify data coming from frontend
      console.log("Raw registrationData:", registrationData);

      // Map frontend field names to database column names with safe parsing
      const mappedData = {
        patient_id: Number(registrationData.patient_id) || null,
        phase_id: 1,
        registration_date: registrationData.registration_date || null,
        city: registrationData.city ? String(registrationData.city).trim() : null,
        completed_by_user_id: Number(registrationData.completed_by_user_id) || null,
        has_hearing_loss:
          registrationData.has_hearing_loss !== undefined && registrationData.has_hearing_loss !== null
            ? registrationData.has_hearing_loss === true || registrationData.has_hearing_loss === "Yes"
              ? "Yes"
              : "No"
            : null,
        uses_sign_language: registrationData.uses_sign_language ? String(registrationData.uses_sign_language).trim() : null,
        uses_speech: registrationData.uses_speech ? String(registrationData.uses_speech).trim() : null,
        hearing_loss_causes: Array.isArray(registrationData.hearing_loss_causes)
          ? registrationData.hearing_loss_causes.filter(Boolean)
          : null,
        ringing_sensation: registrationData.ringing_sensation ? String(registrationData.ringing_sensation).trim() : null,
        ear_pain: registrationData.ear_pain ? String(registrationData.ear_pain).trim() : null,
        hearing_satisfaction_18_plus: registrationData.hearing_satisfaction_18_plus
          ? String(registrationData.hearing_satisfaction_18_plus).trim()
          : null,
        conversation_difficulty: registrationData.conversation_difficulty
          ? String(registrationData.conversation_difficulty).trim()
          : null,
      };

      // Remove undefined, null, or empty array values
      Object.keys(mappedData).forEach((key) => {
        if (mappedData[key] === undefined || mappedData[key] === null) {
          delete mappedData[key];
        }
        if (Array.isArray(mappedData[key]) && mappedData[key].length === 0) {
          delete mappedData[key];
        }
      });

      // Debugging output for mapped data
      console.log("Mapped Data:", mappedData);

      // ✅ Validate required fields
      if (!mappedData.patient_id || isNaN(mappedData.patient_id)) {
        await client.query("ROLLBACK");
        console.error("Validation failed: Missing or invalid patient_id");
        return ResponseHandler.error(res, "Patient ID is required", 400);
      }

      if (!mappedData.registration_date) {
        await client.query("ROLLBACK");
        console.error("Validation failed: Missing registration_date");
        return ResponseHandler.error(res, "Registration date is required", 400);
      }

      // Build INSERT query dynamically
      const columns = Object.keys(mappedData).join(", ");
      const placeholders = Object.keys(mappedData)
        .map((_, index) => `$${index + 1}`)
        .join(", ");
      const values = Object.values(mappedData);

      const query = `
      INSERT INTO phase1_registration_section (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

      console.log("Registration Query:", query);
      console.log("Registration Values:", values);

      const result = await client.query(query, values);

      // Log creation in audit_logs
      await client.query(
        `INSERT INTO audit_logs 
        (table_name, record_id, action_type, new_data, changed_by_user_id) 
        VALUES ($1, $2, $3, $4, $5)`,
        [
          "phase1_registration_section",
          result.rows[0].phase1_reg_id,
          "CREATE",
          JSON.stringify(mappedData),
          req.user?.user_id || null,
        ]
      );

      await client.query("COMMIT");

      return ResponseHandler.success(
        res,
        result.rows[0],
        "Phase 1 registration created successfully",
        201
      );
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Create Phase 1 registration error:", error);
      return ResponseHandler.error(res, "Failed to create Phase 1 registration: " + error.message);
    } finally {
      client.release();
    }
  }

  // Ear Screening
  static async createEarScreening(req, res) {
    const client = await db.getClient();

    // Helper function to map boolean Left/Right flags to the 0/1/2/3 INTEGER code
    const mapEarConditionsToInteger = (left, right) => {
      const isLeft = !!left && (left === true || String(left).toLowerCase() === "yes");
      const isRight = !!right && (right === true || String(right).toLowerCase() === "yes");

      if (isLeft && isRight) return 3; // Both
      if (isLeft) return 1; // Left only
      if (isRight) return 2; // Right only
      return 0; // None
    };

    try {
      await client.query("BEGIN");

      const screeningData = req.body || {};
      screeningData.completed_by_user_id = req.user?.user_id;
      screeningData.phase_id = 1;

      // Debug raw data from frontend
      console.log("Raw screeningData:", screeningData);

      // Collect medication checkboxes into a TEXT[] array
      const medicationGiven = [];
      if (screeningData.medication_antibiotic) medicationGiven.push("Antibiotic");
      if (screeningData.medication_analgesic) medicationGiven.push("Analgesic");
      if (screeningData.medication_antiseptic) medicationGiven.push("Antiseptic");
      if (screeningData.medication_antifungal) medicationGiven.push("Antifungal");

      // Determine if both ears were reported clear for impressions
      const earsClear = String(screeningData.ears_clear).toLowerCase() === "yes";

      // Map frontend field names to database column names
      const mappedData = {
        patient_id: Number(screeningData.patient_id),
        phase_id: 1,
        completed_by_user_id: Number(screeningData.completed_by_user_id) || null,
        screening_name: screeningData.screening_name ? String(screeningData.screening_name).trim() : null,

        // Initial Ears Clear (Uses explicit fields from the UI)
        ears_clear: earsClear ? "Yes" : "No",

        // Map ear conditions using the helper function — set to null when both ears are clear
        otc_wax: earsClear ? null : mapEarConditionsToInteger(screeningData.left_wax, screeningData.right_wax),
        otc_infection: earsClear ? null : mapEarConditionsToInteger(screeningData.left_infection, screeningData.right_infection),
        otc_perforation: earsClear ? null : mapEarConditionsToInteger(screeningData.left_perforation, screeningData.right_perforation),
        otc_tinnitus: earsClear ? null : mapEarConditionsToInteger(screeningData.left_tinnitus, screeningData.right_tinnitus),
        otc_atresia: earsClear ? null : mapEarConditionsToInteger(screeningData.left_atresia, screeningData.right_atresia),
        otc_implant: earsClear ? null : mapEarConditionsToInteger(screeningData.left_implant, screeningData.right_implant),
        otc_other: earsClear ? null : mapEarConditionsToInteger(screeningData.left_other, screeningData.right_other),

        // Text fields and medication arrays — set to null when both ears are clear
        medical_recommendation: earsClear ? null : (screeningData.medical_recommendation ? String(screeningData.medical_recommendation).trim() : null),
        medication_given: earsClear ? null : (medicationGiven.length > 0 ? medicationGiven : null),

        // ✅ Final Ears Clear for Fitting (post-otoscopy) — corrected field names
        left_ear_clear_for_fitting: earsClear ? null : (
          screeningData.left_ear_clear_for_fitting
            ? String(screeningData.left_ear_clear_for_fitting).trim()
            : "No"
        ),
        right_ear_clear_for_fitting: earsClear ? null : (
          screeningData.right_ear_clear_for_fitting
            ? String(screeningData.right_ear_clear_for_fitting).trim()
            : "No"
        ),

        comments: earsClear ? null : (screeningData.comments ? String(screeningData.comments).trim() : null),
      };

      // Get actual columns in the ear_screening table and keep only valid ones
      const colsRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'ear_screening'
    `);
      const tableCols = new Set(colsRes.rows.map((r) => r.column_name));

      const finalMapped = {};
      for (const [key, value] of Object.entries(mappedData)) {
        if (!tableCols.has(key)) {
          console.warn(`Skipping field "${key}" - not present in ear_screening table`);
          continue;
        }
        if (value === undefined || value === null) continue;
        if (Array.isArray(value) && value.length === 0) continue;
        finalMapped[key] = value;
      }

      // Debug mapped data
      console.log("Mapped Ear Screening Data (filtered to existing columns):", finalMapped);

      // ✅ Validate required fields
      if (!finalMapped.patient_id || isNaN(finalMapped.patient_id)) {
        await client.query("ROLLBACK");
        console.error("Validation failed: Missing or invalid patient_id");
        return res.status(400).json({ error: "Patient ID is required" });
      }

      // Build SQL insert
      const columns = Object.keys(finalMapped).join(", ");
      const placeholders = Object.keys(finalMapped).map((_, i) => `$${i + 1}`).join(", ");
      const values = Object.values(finalMapped);

      const query = `
      INSERT INTO ear_screening (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

      console.log("Ear Screening Query:", query);
      console.log("Ear Screening Values:", values);

      const result = await client.query(query, values);

      // Log audit
      await client.query(
        `
        INSERT INTO audit_logs (
          table_name, record_id, action_type, new_data, changed_by_user_id
        ) VALUES ($1, $2, $3, $4, $5)
      `,
        [
          "ear_screening",
          result.rows[0].ear_screening_id,
          "CREATE",
          JSON.stringify(finalMapped),
          req.user?.user_id || null,
        ]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Ear screening created successfully",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Create ear screening error:", error);
      return res.status(500).json({
        error: "Failed to create ear screening",
        details: error.message,
      });
    } finally {
      client.release();
    }
  }

  // Hearing Screening
  static async createHearingScreening(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const hearingScreeningData = req.body
      hearingScreeningData.completed_by_user_id = req.user.user_id
      hearingScreeningData.phase_id = 1

      // Map frontend field names to database column names with correct data types
      const mappedData = {
        patient_id: Number(hearingScreeningData.patient_id),
        phase_id: 1,
        completed_by_user_id: parseInt(hearingScreeningData.completed_by_user_id),
        screening_method: hearingScreeningData.screening_method ? String(hearingScreeningData.screening_method) : null,
        left_ear_result: hearingScreeningData.left_ear_result ? String(hearingScreeningData.left_ear_result) : null,
        right_ear_result: hearingScreeningData.right_ear_result ? String(hearingScreeningData.right_ear_result) : null,
        hearing_satisfaction_18_plus_pass: hearingScreeningData.hearing_satisfaction_18_plus_pass ?
          String(hearingScreeningData.hearing_satisfaction_18_plus_pass) : null
      }

      // Remove undefined values
      Object.keys(mappedData).forEach(key => {
        if (mappedData[key] === undefined || mappedData[key] === null) {
          delete mappedData[key]
        }
      })

      // Validate required fields
      if (!mappedData.patient_id) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }

      const columns = Object.keys(mappedData).join(", ")
      const placeholders = Object.keys(mappedData)
        .map((_, index) => `$${index + 1}`)
        .join(", ")
      const values = Object.values(mappedData)

      const query = `
        INSERT INTO hearing_screening (${columns})
        VALUES (${placeholders})
        RETURNING *
      `

      console.log("Hearing Screening Query:", query)
      console.log("Hearing Screening Values:", values)

      const result = await client.query(query, values)

      // Log creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        [
          "hearing_screening",
          result.rows[0].hearing_screen_id,
          "CREATE",
          JSON.stringify(mappedData),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "Hearing screening created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create hearing screening error:", error)
      return ResponseHandler.error(res, "Failed to create hearing screening: " + error.message)
    } finally {
      client.release()
    }
  }

  // Ear Impressions
  static async createEarImpression(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const impressionData = req.body
      impressionData.completed_by_user_id = req.user.user_id
      impressionData.phase_id = 1

      // Map frontend field names to database column names with correct data types
      const mappedData = {
        patient_id: Number(impressionData.patient_id),
        phase_id: 1,
        completed_by_user_id: parseInt(impressionData.completed_by_user_id),
        ear_impression: impressionData.ear_impression ? String(impressionData.ear_impression) : null,
        comment: impressionData.comment ? String(impressionData.comment) : null
      }

      // Remove undefined values
      Object.keys(mappedData).forEach(key => {
        if (mappedData[key] === undefined || mappedData[key] === null) {
          delete mappedData[key]
        }
      })

      // Validate required fields
      if (!mappedData.patient_id) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }

      if (!mappedData.ear_impression) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Ear impression type is required", 400)
      }

      const columns = Object.keys(mappedData).join(", ")
      const placeholders = Object.keys(mappedData)
        .map((_, index) => `$${index + 1}`)
        .join(", ")
      const values = Object.values(mappedData)

      const query = `
        INSERT INTO ear_impressions (${columns})
        VALUES (${placeholders})
        RETURNING *
      `

      console.log("Ear Impression Query:", query)
      console.log("Ear Impression Values:", values)

      const result = await client.query(query, values)

      // Log creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["ear_impressions", result.rows[0].impression_id, "CREATE", JSON.stringify(mappedData), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "Ear impression created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create ear impression error:", error)
      return ResponseHandler.error(res, "Failed to create ear impression: " + error.message)
    } finally {
      client.release()
    }
  }

  // Final QC Phase 1
  static async createFinalQC(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const qcData = req.body
      qcData.completed_by_user_id = req.user.user_id
      qcData.phase_id = 1

      // Map frontend field names to database column names with correct data types
      const mappedData = {
        patient_id: Number(qcData.patient_id),
        phase_id: 1,
        completed_by_user_id: parseInt(qcData.completed_by_user_id),
        ear_impressions_inspected_collected: Boolean(qcData.ear_impressions_inspected),
        shf_id_number_id_card_given: Boolean(qcData.shf_id_card_given)
      }

      // Remove undefined values
      Object.keys(mappedData).forEach(key => {
        if (mappedData[key] === undefined || mappedData[key] === null) {
          delete mappedData[key]
        }
      })

      // Validate required fields
      if (!mappedData.patient_id) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }

      const columns = Object.keys(mappedData).join(", ")
      const placeholders = Object.keys(mappedData)
        .map((_, index) => `$${index + 1}`)
        .join(", ")
      const values = Object.values(mappedData)

      const query = `
        INSERT INTO final_qc_p1 (${columns})
        VALUES (${placeholders})
        RETURNING *
      `

      console.log("Final QC Query:", query)
      console.log("Final QC Values:", values)

      const result = await client.query(query, values)

      // Log creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["final_qc_p1", result.rows[0].final_qc_id, "CREATE", JSON.stringify(mappedData), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "Phase 1 final QC created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create Phase 1 final QC error:", error)
      return ResponseHandler.error(res, "Failed to create Phase 1 final QC: " + error.message)
    } finally {
      client.release();
    }
  }

  // Get methods
  static async getRegistrations(req, res) {
    try {
      const { patient_id, page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT p1r.*, p.first_name, p.last_name, p.shf_id, u.username as completed_by
        FROM phase1_registration_section p1r
        LEFT JOIN patients p ON p1r.patient_id = p.patient_id
        LEFT JOIN users u ON p1r.completed_by_user_id = u.user_id
      `

      const conditions = []
      const params = []

      if (patient_id) {
        conditions.push(`p1r.patient_id = $${params.length + 1}`)
        params.push(parseInt(patient_id))
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY p1r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(parseInt(limit), parseInt(offset))

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Phase 1 registrations retrieved successfully")
    } catch (error) {
      console.error("Get Phase 1 registrations error:", error)
      return ResponseHandler.error(res, "Failed to retrieve Phase 1 registrations")
    }
  }

  static async getEarScreenings(req, res) {
    try {
      const { patient_id, phase_id, page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT es.*, p.first_name, p.last_name, p.shf_id, u.username as completed_by, ph.phase_name
        FROM ear_screening es
        LEFT JOIN patients p ON es.patient_id = p.patient_id
        LEFT JOIN users u ON es.completed_by_user_id = u.user_id
        LEFT JOIN phases ph ON es.phase_id = ph.phase_id
      `

      const conditions = []
      const params = []

      if (patient_id) {
        conditions.push(`es.patient_id = $${params.length + 1}`)
        params.push(parseInt(patient_id))
      }

      if (phase_id) {
        conditions.push(`es.phase_id = $${params.length + 1}`)
        params.push(parseInt(phase_id))
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY es.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(parseInt(limit), parseInt(offset))

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Ear screenings retrieved successfully")
    } catch (error) {
      console.error("Get ear screenings error:", error)
      return ResponseHandler.error(res, "Failed to retrieve ear screenings")
    }
  }

  static async getHearingScreenings(req, res) {
    try {
      const { patient_id, phase_id, page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT hs.*, p.first_name, p.last_name, p.shf_id, u.username as completed_by, ph.phase_name
        FROM hearing_screening hs
        LEFT JOIN patients p ON hs.patient_id = p.patient_id
        LEFT JOIN users u ON hs.completed_by_user_id = u.user_id
        LEFT JOIN phases ph ON hs.phase_id = ph.phase_id
      `

      const conditions = []
      const params = []

      if (patient_id) {
        conditions.push(`hs.patient_id = $${params.length + 1}`)
        params.push(parseInt(patient_id))
      }

      if (phase_id) {
        conditions.push(`hs.phase_id = $${params.length + 1}`)
        params.push(parseInt(phase_id))
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY hs.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(parseInt(limit), parseInt(offset))

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Hearing screenings retrieved successfully")
    } catch (error) {
      console.error("Get hearing screenings error:", error)
      return ResponseHandler.error(res, "Failed to retrieve hearing screenings")
    }
  }

  static async getEarImpressions(req, res) {
    try {
      const { patient_id, page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT ei.*, p.first_name, p.last_name, p.shf_id, u.username as completed_by, ph.phase_name
        FROM ear_impressions ei
        LEFT JOIN patients p ON ei.patient_id = p.patient_id
        LEFT JOIN users u ON ei.completed_by_user_id = u.user_id
        LEFT JOIN phases ph ON ei.phase_id = ph.phase_id
      `

      const conditions = []
      const params = []

      if (patient_id) {
        conditions.push(`ei.patient_id = $${params.length + 1}`)
        params.push(parseInt(patient_id))
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY ei.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(parseInt(limit), parseInt(offset))

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Ear impressions retrieved successfully")
    } catch (error) {
      console.error("Get ear impressions error:", error)
      return ResponseHandler.error(res, "Failed to retrieve ear impressions")
    }
  }

  static async getFinalQCs(req, res) {
    try {
      const { patient_id, page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT fqc.*, p.first_name, p.last_name, p.shf_id, u.username as completed_by, ph.phase_name
        FROM final_qc_p1 fqc
        LEFT JOIN patients p ON fqc.patient_id = p.patient_id
        LEFT JOIN users u ON fqc.completed_by_user_id = u.user_id
        LEFT JOIN phases ph ON fqc.phase_id = ph.phase_id
      `

      const conditions = []
      const params = []

      if (patient_id) {
        conditions.push(`fqc.patient_id = $${params.length + 1}`)
        params.push(parseInt(patient_id))
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY fqc.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(parseInt(limit), parseInt(offset))

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Phase 1 final QCs retrieved successfully")
    } catch (error) {
      console.error("Get Phase 1 final QCs error:", error)
      return ResponseHandler.error(res, "Failed to retrieve Phase 1 final QCs")
    }
  }

  // Get complete Phase 1 data for a patient
  static async getPhase1Data(req, res) {
    try {
      const { patientId } = req.params

      const queries = {
        registration: `
          SELECT * FROM phase1_registration_section 
          WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1
        `,
        earScreening: `
          SELECT * FROM ear_screening 
          WHERE patient_id = $1 AND phase_id = 1 ORDER BY created_at DESC
        `,
        hearingScreening: `
          SELECT * FROM hearing_screening 
          WHERE patient_id = $1 AND phase_id = 1 ORDER BY created_at DESC LIMIT 1
        `,
        earImpressions: `
          SELECT * FROM ear_impressions 
          WHERE patient_id = $1 ORDER BY created_at DESC
        `,
        finalQC: `
          SELECT * FROM final_qc_p1 
          WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1
        `,
      }

      const results = {}

      for (const [key, query] of Object.entries(queries)) {
        const result = await db.query(query, [parseInt(patientId)])
        results[key] = key === "earScreening" || key === "earImpressions" ? result.rows : result.rows[0] || null
      }

      return ResponseHandler.success(res, results, "Phase 1 data retrieved successfully")
    } catch (error) {
      console.error("Get Phase 1 data error:", error)
      return ResponseHandler.error(res, "Failed to retrieve Phase 1 data")
    }
  }

  // Update methods
  static async updateRegistration(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { registrationId } = req.params
      const registrationData = req.body

      // Get current data for audit log
      const currentRegistrationResult = await client.query(
        "SELECT * FROM phase1_registration_section WHERE phase1_reg_id = $1",
        [parseInt(registrationId)]
      )

      if (currentRegistrationResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Phase 1 registration not found")
      }

      const currentRegistration = currentRegistrationResult.rows[0]

      // Build update query dynamically
      const columns = Object.keys(registrationData)
      if (columns.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "No data provided for update", 400)
      }

      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(", ")
      const values = Object.values(registrationData)
      values.push(parseInt(registrationId))

      const query = `
        UPDATE phase1_registration_section 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE phase1_reg_id = $${values.length}
        RETURNING *
      `

      const result = await client.query(query, values)
      const updatedRegistration = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "phase1_registration_section",
          registrationId,
          "UPDATE",
          JSON.stringify(currentRegistration),
          JSON.stringify(updatedRegistration),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedRegistration, "Phase 1 registration updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update Phase 1 registration error:", error)
      return ResponseHandler.error(res, "Failed to update Phase 1 registration")
    } finally {
      client.release()
    }
  }

  static async updateEarScreening(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { screeningId } = req.params
      const screeningData = req.body

      // Get current data for audit log
      const currentScreeningResult = await client.query(
        "SELECT * FROM ear_screening WHERE ear_screening_id = $1",
        [parseInt(screeningId)]
      )

      if (currentScreeningResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Ear screening not found")
      }

      const currentScreening = currentScreeningResult.rows[0]

      // Build update query dynamically
      const columns = Object.keys(screeningData)
      if (columns.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "No data provided for update", 400)
      }

      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(", ")
      const values = Object.values(screeningData)
      values.push(parseInt(screeningId))

      const query = `
        UPDATE ear_screening 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE ear_screening_id = $${values.length}
        RETURNING *
      `

      const result = await client.query(query, values)
      const updatedScreening = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "ear_screening",
          screeningId,
          "UPDATE",
          JSON.stringify(currentScreening),
          JSON.stringify(updatedScreening),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedScreening, "Ear screening updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update ear screening error:", error)
      return ResponseHandler.error(res, "Failed to update ear screening")
    } finally {
      client.release()
    }
  }

  static async updateHearingScreening(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { screeningId } = req.params
      const screeningData = req.body

      // Get current data for audit log
      const currentScreeningResult = await client.query(
        "SELECT * FROM hearing_screening WHERE hearing_screen_id = $1",
        [parseInt(screeningId)]
      )

      if (currentScreeningResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Hearing screening not found")
      }

      const currentScreening = currentScreeningResult.rows[0]

      // Build update query dynamically
      const columns = Object.keys(screeningData)
      if (columns.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "No data provided for update", 400)
      }

      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(", ")
      const values = Object.values(screeningData)
      values.push(parseInt(screeningId))

      const query = `
        UPDATE hearing_screening 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE hearing_screen_id = $${values.length}
        RETURNING *
      `

      const result = await client.query(query, values)
      const updatedScreening = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "hearing_screening",
          screeningId,
          "UPDATE",
          JSON.stringify(currentScreening),
          JSON.stringify(updatedScreening),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedScreening, "Hearing screening updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update hearing screening error:", error)
      return ResponseHandler.error(res, "Failed to update hearing screening")
    } finally {
      client.release()
    }
  }

  static async updateEarImpression(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { impressionId } = req.params
      const impressionData = req.body

      // Get current data for audit log
      const currentImpressionResult = await client.query(
        "SELECT * FROM ear_impressions WHERE impression_id = $1",
        [parseInt(impressionId)]
      )

      if (currentImpressionResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Ear impression not found")
      }

      const currentImpression = currentImpressionResult.rows[0]

      // Build update query dynamically
      const columns = Object.keys(impressionData)
      if (columns.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "No data provided for update", 400)
      }

      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(", ")
      const values = Object.values(impressionData)
      values.push(parseInt(impressionId))

      const query = `
        UPDATE ear_impressions 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE impression_id = $${values.length}
        RETURNING *
      `

      const result = await client.query(query, values)
      const updatedImpression = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "ear_impressions",
          impressionId,
          "UPDATE",
          JSON.stringify(currentImpression),
          JSON.stringify(updatedImpression),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedImpression, "Ear impression updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update ear impression error:", error)
      return ResponseHandler.error(res, "Failed to update ear impression")
    } finally {
      client.release()
    }
  }

  static async updateFinalQC(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { qcId } = req.params
      const qcData = req.body

      // Get current data for audit log
      const currentQCResult = await client.query(
        "SELECT * FROM final_qc_p1 WHERE final_qc_id = $1",
        [parseInt(qcId)]
      )

      if (currentQCResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Final QC not found")
      }

      const currentQC = currentQCResult.rows[0]

      // Build update query dynamically
      const columns = Object.keys(qcData)
      if (columns.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "No data provided for update", 400)
      }

      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(", ")
      const values = Object.values(qcData)
      values.push(parseInt(qcId))

      const query = `
        UPDATE final_qc_p1 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE final_qc_id = $${values.length}
        RETURNING *
      `

      const result = await client.query(query, values)
      const updatedQC = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "final_qc_p1",
          qcId,
          "UPDATE",
          JSON.stringify(currentQC),
          JSON.stringify(updatedQC),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedQC, "Final QC updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update final QC error:", error)
      return ResponseHandler.error(res, "Failed to update final QC")
    } finally {
      client.release()
    }
  }
}

module.exports = Phase1Controller