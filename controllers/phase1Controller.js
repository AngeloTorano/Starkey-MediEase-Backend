const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")
const { resolvePhaseRegistrationId } = require("../utils/resolveRegistration")

// Helper: map left/right boolean ear condition flags to integer (DB encoding)
// 0 = none, 1 = left, 2 = right, 3 = both
function mapEarConditionsToInteger(left, right) {
  const l = !!left;
  const r = !!right;
  if (!l && !r) return 0;
  if (l && r) return 3;
  if (l) return 1;
  if (r) return 2;
  return 0;
}

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
      const registrationRow = result.rows[0];

      // Return registration including phase1_reg_id so frontend can link other sections
      await client.query("COMMIT");
      return ResponseHandler.success(
        res,
        registrationRow,
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
    try {
      await client.query("BEGIN");
      const screeningData = req.body || {};
      screeningData.completed_by_user_id = req.user?.user_id;
      screeningData.phase_id = 1;

      let phase1_reg_id = await resolvePhaseRegistrationId(client, 1, screeningData.patient_id, screeningData.phase1_reg_id);

      console.log("Raw screeningData:", screeningData);

      const medicationGiven = [];
      if (screeningData.medication_antibiotic) medicationGiven.push("Antibiotic");
      if (screeningData.medication_analgesic) medicationGiven.push("Analgesic");
      if (screeningData.medication_antiseptic) medicationGiven.push("Antiseptic");
      if (screeningData.medication_antifungal) medicationGiven.push("Antifungal");

      const earsClearForImpressions =
        String(screeningData.ears_clear_for_impressions || screeningData.ears_clear || "")
          .toLowerCase() === "yes";

      const mappedData = {
        patient_id: Number(screeningData.patient_id),
        phase_id: 1,
        phase1_reg_id,
        completed_by_user_id: Number(screeningData.completed_by_user_id) || null,
        screening_name: screeningData.screening_name ? String(screeningData.screening_name).trim() : null,
        ears_clear: earsClearForImpressions ? "Yes" : "No",
        otc_wax: earsClearForImpressions ? null : mapEarConditionsToInteger(screeningData.left_wax, screeningData.right_wax),
        otc_infection: earsClearForImpressions ? null : mapEarConditionsToInteger(screeningData.left_infection, screeningData.right_infection),
        otc_perforation: earsClearForImpressions ? null : mapEarConditionsToInteger(screeningData.left_perforation, screeningData.right_perforation),
        otc_tinnitus: earsClearForImpressions ? null : mapEarConditionsToInteger(screeningData.left_tinnitus, screeningData.right_tinnitus),
        otc_atresia: earsClearForImpressions ? null : mapEarConditionsToInteger(screeningData.left_atresia, screeningData.right_atresia),
        otc_implant: earsClearForImpressions ? null : mapEarConditionsToInteger(screeningData.left_implant, screeningData.right_implant),
        otc_other: earsClearForImpressions ? null : mapEarConditionsToInteger(screeningData.left_other, screeningData.right_other),
        medical_recommendation: earsClearForImpressions ? null : (screeningData.medical_recommendation ? String(screeningData.medical_recommendation).trim() : null),
        medication_given: earsClearForImpressions ? null : (medicationGiven.length ? medicationGiven : null),
        left_ear_clear_for_fitting: earsClearForImpressions ? null :
          (screeningData.left_ear_clear_for_fitting ? String(screeningData.left_ear_clear_for_fitting).trim() : "No"),
        right_ear_clear_for_fitting: earsClearForImpressions ? null :
          (screeningData.right_ear_clear_for_fitting ? String(screeningData.right_ear_clear_for_fitting).trim() : "No"),
        comments: earsClearForImpressions ? null : (screeningData.comments ? String(screeningData.comments).trim() : null),
      };

      const colsRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ear_screening'
      `);
      const tableCols = new Set(colsRes.rows.map(r => r.column_name));

      const finalMapped = {};
      for (const [k, v] of Object.entries(mappedData)) {
        if (!tableCols.has(k)) continue;
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        finalMapped[k] = v;
      }

      if (!finalMapped.patient_id || isNaN(finalMapped.patient_id)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Patient ID is required" });
      }

      const columns = Object.keys(finalMapped).join(", ");
      const placeholders = Object.keys(finalMapped).map((_, i) => `$${i + 1}`).join(", ");
      const values = Object.values(finalMapped);

      const query = `INSERT INTO ear_screening (${columns}) VALUES (${placeholders}) RETURNING *`;

      const result = await client.query(query, values);

      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id)
         VALUES ($1,$2,$3,$4,$5)`,
        ["ear_screening", result.rows[0].ear_screening_id, "CREATE", JSON.stringify(finalMapped), req.user?.user_id || null]
      );

      await client.query("COMMIT");
      return res.status(201).json({ message: "Ear screening created successfully", data: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Create ear screening error:", error);
      return res.status(500).json({ error: "Failed to create ear screening", details: error.message });
    } finally {
      client.release();
    }
  }

  // Hearing Screening
  static async createHearingScreening(req, res) {
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      const data = req.body || {};
      data.completed_by_user_id = req.user.user_id;
      data.phase_id = 1;

      let phase1_reg_id = await resolvePhaseRegistrationId(client, 1, data.patient_id, data.phase1_reg_id);

      const mappedData = {
        patient_id: Number(data.patient_id),
        phase_id: 1,
        phase1_reg_id,
        completed_by_user_id: Number(data.completed_by_user_id),
        screening_method: data.screening_method || null,
        left_ear_result: data.left_ear_result || null,
        right_ear_result: data.right_ear_result || null,
        hearing_satisfaction_18_plus_pass: data.hearing_satisfaction_18_plus_pass || null
      };

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
      client.release();
    }
  }

  // Ear Impressions
  static async createEarImpression(req, res) {
    const client = await db.getClient()
    try {
      await client.query("BEGIN")
      const impressionData = req.body || {}
      impressionData.completed_by_user_id = req.user.user_id

      // Resolve phase1_reg_id if not provided
      let phase1_reg_id = await resolvePhaseRegistrationId(client, 1, impressionData.patient_id, impressionData.phase1_reg_id)

      // Map fields
      const mappedData = {
        patient_id: Number(impressionData.patient_id),
        phase_id: 1,
        phase1_reg_id,
        completed_by_user_id: Number(impressionData.completed_by_user_id),
        ear_impression: impressionData.ear_impression ? String(impressionData.ear_impression).trim() : null, // Left | Right
        comment: impressionData.comment ? String(impressionData.comment).trim() : null,
      }

      // Validate
      if (!mappedData.patient_id || isNaN(mappedData.patient_id)) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }
      if (!mappedData.ear_impression) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Ear impression side is required (Left/Right)", 400)
      }

      // Remove null/undefined
      Object.keys(mappedData).forEach((k) => (mappedData[k] === undefined || mappedData[k] === null) && delete mappedData[k])

      // Insert
      const columns = Object.keys(mappedData).join(", ")
      const placeholders = Object.keys(mappedData).map((_, i) => `$${i + 1}`).join(", ")
      const values = Object.values(mappedData)

      const query = `
        INSERT INTO ear_impressions (${columns})
        VALUES (${placeholders})
        RETURNING *
      `
      const result = await client.query(query, values)

      // Audit
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["ear_impressions", result.rows[0].impression_id, "CREATE", JSON.stringify(mappedData), req.user.user_id]
      )

      // Inventory management - consume impression material
      try {
        // Example: consume 1 unit of impression material supply
        await InventoryService.updateStockByCode(
          client,
          "SUP-00001",
          -1,
          "Used",
          req.user.user_id,
          `Ear impression ${mappedData.ear_impression}`,
          { patient_id: mappedData.patient_id, phase_id: 1, related_event_type: "Ear Impression" }
        )
      } catch (invErr) {
        console.warn("Inventory usage (Phase1 Ear Impression) failed:", invErr.message)
      }

      await client.query("COMMIT")
      return ResponseHandler.success(res, result.rows[0], "Ear impression created successfully", 201)
    } catch (e) {
      await client.query("ROLLBACK")
      console.error("Create ear impression error:", e)
      return ResponseHandler.error(res, "Failed to create ear impression: " + e.message)
    } finally {
      client.release()
    }
  }

  // Final QC
  static async createFinalQC(req, res) {
    const client = await db.getClient()
    try {
      await client.query("BEGIN")
      const qcData = req.body || {}
      qcData.completed_by_user_id = req.user.user_id

      // Resolve phase1_reg_id if not provided
      let phase1_reg_id = await resolvePhaseRegistrationId(client, 1, qcData.patient_id, qcData.phase1_reg_id)

      // Map fields
      const mappedData = {
        patient_id: Number(qcData.patient_id),
        phase_id: 1,
        phase1_reg_id,
        completed_by_user_id: Number(qcData.completed_by_user_id),
        ear_impressions_inspected_collected: Boolean(qcData.ear_impressions_inspected_collected),
        shf_id_number_id_card_given: Boolean(qcData.shf_id_number_id_card_given),
      }

      // Validate
      if (!mappedData.patient_id || isNaN(mappedData.patient_id)) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }

      // Insert
      const columns = Object.keys(mappedData).join(", ")
      const placeholders = Object.keys(mappedData).map((_, i) => `$${i + 1}`).join(", ")
      const values = Object.values(mappedData)

      const query = `
        INSERT INTO final_qc_p1 (${columns})
        VALUES (${placeholders})
        RETURNING *
      `
      const result = await client.query(query, values)

      // Audit
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["final_qc_p1", result.rows[0].final_qc_id, "CREATE", JSON.stringify(mappedData), req.user.user_id]
      )

      await client.query("COMMIT")
      return ResponseHandler.success(res, result.rows[0], "Final QC created successfully", 201)
    } catch (e) {
      await client.query("ROLLBACK")
      console.error("Create final QC error:", e)
      return ResponseHandler.error(res, "Failed to create final QC: " + e.message)
    } finally {
      client.release()
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
      const { patientId, regId } = req.params; // allow optional /api/phase1/patient/:patientId/registration/:regId
      let registrationFilter = "";
      const params = [parseInt(patientId)];

      if (regId) {
        registrationFilter = "AND p1.phase1_reg_id = $2";
        params.push(parseInt(regId));
      }

      // Latest (or specific) registration
      const regQuery = `
        SELECT * FROM phase1_registration_section p1
        WHERE patient_id = $1 ${registrationFilter}
        ORDER BY registration_date DESC, created_at DESC
        LIMIT 1
      `;
      const regRes = await db.query(regQuery, params);
      const registration = regRes.rows[0] || null;
      const regIdToUse = registration?.phase1_reg_id;

      // Fetch linked sections by phase1_reg_id when available
      const sectionQueries = {
        earScreening: `
          SELECT * FROM ear_screening
          WHERE patient_id = $1 AND phase_id = 1
          ${regIdToUse ? "AND phase1_reg_id = $2" : ""}
          ORDER BY created_at DESC
        `,
        hearingScreening: `
          SELECT * FROM hearing_screening
          WHERE patient_id = $1 AND phase_id = 1
          ${regIdToUse ? "AND phase1_reg_id = $2" : ""}
          ORDER BY created_at DESC LIMIT 1
        `,
        earImpressions: `
          SELECT * FROM ear_impressions
          WHERE patient_id = $1 AND phase_id = 1
          ${regIdToUse ? "AND phase1_reg_id = $2" : ""}
          ORDER BY created_at DESC
        `,
        finalQC: `
          SELECT * FROM final_qc_p1
          WHERE patient_id = $1 AND phase_id = 1
          ${regIdToUse ? "AND phase1_reg_id = $2" : ""}
          ORDER BY created_at DESC LIMIT 1
        `
      };

      const qParams = regIdToUse ? [parseInt(patientId), regIdToUse] : [parseInt(patientId)];
      const results = {};
      for (const [key, q] of Object.entries(sectionQueries)) {
        const r = await db.query(q, qParams);
        results[key] = key === "earScreening" || key === "earImpressions" ? r.rows : r.rows[0] || null;
      }

      return ResponseHandler.success(res, {
        registration,
        ...results
      }, "Phase 1 data retrieved");
    } catch (e) {
      console.error("getPhase1Data error:", e);
      return ResponseHandler.error(res, "Failed to retrieve Phase 1 data");
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