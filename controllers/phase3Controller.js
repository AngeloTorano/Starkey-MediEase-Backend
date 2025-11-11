"use strict";

const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")
const { resolvePhaseRegistrationId } = require("../utils/resolveRegistration");
const InventoryService = require("../services/inventoryService");

  class Phase3Controller {

      static async resolveLatestIncompleteRegId(client, patientId) {
    const q = `
      SELECT r.phase3_reg_id,
             EXISTS(SELECT 1 FROM ear_screening_p3 e WHERE e.phase3_reg_id = r.phase3_reg_id) AS ear_screening_exists,
             EXISTS(SELECT 1 FROM aftercare_assessment a WHERE a.phase3_reg_id = r.phase3_reg_id) AS aftercare_exists,
             EXISTS(SELECT 1 FROM final_qc_p3 f WHERE f.phase3_reg_id = r.phase3_reg_id) AS finalqc_exists
      FROM phase3_registration_section r
      WHERE r.patient_id = $1
      ORDER BY r.registration_date DESC NULLS LAST, r.created_at DESC NULLS LAST
    `;
    const r = await client.query(q, [patientId]);
    for (const row of r.rows) {
      if (!(row.ear_screening_exists && row.aftercare_exists && row.finalqc_exists)) {
        return row.phase3_reg_id; // first (latest) incomplete
      }
    }
    return null; // all complete or none exist
  }
  
  // Helper to map boolean Left/Right to 0/1/2/3 (None/Left/Right/Both)
  static mapEarConditionsToInteger(left, right) {
    const normalize = (v) => {
      if (v === undefined || v === null) return false
      if (typeof v === "boolean") return v
      if (typeof v === "number") return v === 1
      const s = String(v).toLowerCase()
      return s === "yes" || s === "true" || s === "1"
    }

    const isLeft = normalize(left)
    const isRight = normalize(right)

    if (isLeft && isRight) return 3
    if (isLeft) return 1
    if (isRight) return 2
    return 0
  }

static async createRegistration(req, res) {
    const client = await db.getClient()
    try {
      await client.query("BEGIN")

      const data = req.body || {}
      data.completed_by_user_id = req.user?.user_id ?? data.completed_by_user_id
      data.phase_id = 3

      // Build mapped payload (canonical keys used by DB)
      const mappedData = {
        patient_id: data.patient_id !== undefined ? Number(data.patient_id) : undefined,
        registration_date: data.registration_date ?? data.phase3_date ?? null,
        country: data.country ?? null,
        city: data.city ?? data.phase3_aftercare_city ?? null,
        type_of_aftercare: data.type_of_aftercare ?? null,
        service_center_school_name: data.service_center_school_name ?? data.service_center_or_school_name ?? null,
        return_visit_custom_earmold_repair:
          data.return_visit_custom_earmold_repair !== undefined
            ? Boolean(data.return_visit_custom_earmold_repair)
            : data.return_visit_custom_earmold_repair ?? null,
        problem_with_hearing_aid_earmold: String(data.hearing_aid_problem_earmold ?? null).trim(),
        phase_id: 3,
        completed_by_user_id: Number(data.completed_by_user_id),
      }

      // Remove undefined/null values before DB mapping
      Object.keys(mappedData).forEach((k) => {
        if (mappedData[k] === undefined || mappedData[k] === null) delete mappedData[k]
      })

      if (!mappedData.patient_id || isNaN(mappedData.patient_id)) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }

      // Keep only columns that actually exist in the table
      const colsRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'phase3_registration_section'
      `)
      const tableCols = new Set(colsRes.rows.map((r) => r.column_name))

      const finalMapped = {}
      for (const [key, value] of Object.entries(mappedData)) {
        if (!tableCols.has(key)) {
          console.warn(`Skipping field "${key}" - not present in phase3_registration_section table`)
          continue
        }
        finalMapped[key] = value
      }

      const cols = Object.keys(finalMapped)
      if (cols.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "No valid registration fields provided", 400)
      }

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ")
      const insertSql = `INSERT INTO phase3_registration_section (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`
      const values = cols.map((c) => finalMapped[c])

      const insertRes = await client.query(insertSql, values)

      // audit log
      const newId = insertRes.rows[0].phase3_reg_id || insertRes.rows[0].id || null
      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
        ["phase3_registration_section", newId, "CREATE", JSON.stringify(finalMapped), req.user?.user_id || null],
      )

      await client.query("COMMIT")
      return ResponseHandler.success(res, insertRes.rows[0], "Registration saved", 201)
    } catch (err) {
      await client.query("ROLLBACK")
      console.error("createRegistration error:", err)
      return ResponseHandler.error(res, "Failed to save registration: " + (err?.message || err))
    } finally {
      client.release()
    }
  }

  // Ear Screening (map booleans -> otc_* integers, medication array)
  static async createEarScreening(req, res) {
    const client = await db.getClient()
    try {
      await client.query("BEGIN")

      const screeningData = req.body || {}
      screeningData.completed_by_user_id = req.user?.user_id
      screeningData.phase_id = 3

      // resolve reg id FIRST so it’s part of filtered payload
      const phase3_reg_id = await resolvePhaseRegistrationId(
        client, 3, screeningData.patient_id, screeningData.phase3_reg_id
      )

      const medicationGiven = []
      if (screeningData.medication_antibiotic) medicationGiven.push("Antibiotic")
      if (screeningData.medication_analgesic) medicationGiven.push("Analgesic")
      if (screeningData.medication_antiseptic) medicationGiven.push("Antiseptic")
      if (screeningData.medication_antifungal) medicationGiven.push("Antifungal")

      const earsClear = screeningData.ears_clear_for_assessment
        ? String(screeningData.ears_clear_for_assessment).toLowerCase() === "yes"
        : String(screeningData.ears_clear || "").toLowerCase() === "yes"

      const mappedData = {
        patient_id: Number(screeningData.patient_id),
        phase_id: 3,
        phase3_reg_id: phase3_reg_id || null,
        completed_by_user_id: Number(screeningData.completed_by_user_id) || null,
        screening_name: screeningData.screening_name || "Aftercare",
        ears_clear: earsClear ? "Yes" : "No",
        otc_wax: earsClear ? null : Phase3Controller.mapEarConditionsToInteger(screeningData.left_wax, screeningData.right_wax),
        otc_infection: earsClear ? null : Phase3Controller.mapEarConditionsToInteger(screeningData.left_infection, screeningData.right_infection),
        otc_perforation: earsClear ? null : Phase3Controller.mapEarConditionsToInteger(screeningData.left_perforation, screeningData.right_perforation),
        otc_other: earsClear ? null : Phase3Controller.mapEarConditionsToInteger(screeningData.left_other, screeningData.right_other),
        medical_recommendation: earsClear ? null : (screeningData.medical_recommendation ? String(screeningData.medical_recommendation).trim() : null),
        medication_given: earsClear ? null : (medicationGiven.length > 0 ? medicationGiven : null),
        left_ear_clear_for_fitting: screeningData.left_ear_clear_for_assessment || screeningData.left_ear_clear_for_fitting || null,
        right_ear_clear_for_fitting: screeningData.right_ear_clear_for_assessment || screeningData.right_ear_clear_for_fitting || null,
        comments: earsClear ? null : (screeningData.otoscopy_comments || screeningData.comments || null),
      }

      const colsRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ear_screening'
      `)
      const tableCols = new Set(colsRes.rows.map((r) => r.column_name))

      const finalMapped = {}
      for (const [key, value] of Object.entries(mappedData)) {
        if (!tableCols.has(key)) {
          console.warn(`Skipping field "${key}" - not present in ear_screening table`)
          continue
        }
        if (value === undefined || value === null) continue
        if (Array.isArray(value) && value.length === 0) continue
        finalMapped[key] = value
      }

      if (!finalMapped.patient_id || isNaN(finalMapped.patient_id)) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }

      const query = `
        INSERT INTO ear_screening (${Object.keys(finalMapped).join(", ")})
        VALUES (${Object.keys(finalMapped).map((_, i) => `$${i + 1}`).join(", ")})
        RETURNING *
      `

      const result = await client.query(query, Object.values(finalMapped))

      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
        ["ear_screening", result.rows[0].ear_screening_id, "CREATE", JSON.stringify(finalMapped), req.user?.user_id || null],
      )

      await client.query("COMMIT")
      return ResponseHandler.success(res, result.rows[0], "Ear screening created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create ear screening error:", error)
      return ResponseHandler.error(res, "Failed to create ear screening: " + (error?.message || error))
    } finally {
      client.release()
    }
  }

  // Aftercare Assessment (map booleans to integers where DB expects integer flags)
 static async createAftercareAssessment(req, res) {
    const client = await db.getClient()
    try {
      await client.query("BEGIN")

      const assessmentData = req.body || {}
      assessmentData.completed_by_user_id = req.user?.user_id
      assessmentData.phase_id = 3

      // RESOLVE PHASE 3 REG ID (ADDED)
      const phase3_reg_id = await resolvePhaseRegistrationId(
        client, 3, assessmentData.patient_id, assessmentData.phase3_reg_id
      )

      const b2i = (v) => {
        if (v === undefined || v === null) return null
        return v ? 1 : 0
      }

      // If client provided unified eval_* fields use them; otherwise derive from left/right booleans
      const eval_hearing_aid_dead_broken =
        assessmentData.eval_hearing_aid_dead_broken !== undefined
          ? Number(assessmentData.eval_hearing_aid_dead_broken)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_ha_dead_or_broken, assessmentData.right_ha_dead_or_broken)

      const eval_hearing_aid_internal_feedback =
        assessmentData.eval_hearing_aid_internal_feedback !== undefined
          ? Number(assessmentData.eval_hearing_aid_internal_feedback)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_ha_internal_feedback, assessmentData.right_ha_internal_feedback)

      const eval_hearing_aid_power_change_needed =
        assessmentData.eval_hearing_aid_power_change_needed !== undefined
          ? Number(assessmentData.eval_hearing_aid_power_change_needed)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_ha_power_change_needed, assessmentData.right_ha_power_change_needed)

      const eval_hearing_aid_power_change_too_low =
        assessmentData.eval_hearing_aid_power_change_too_low !== undefined
          ? Number(assessmentData.eval_hearing_aid_power_change_too_low)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_ha_power_change_too_low, assessmentData.right_ha_power_change_too_low)

      const eval_hearing_aid_power_change_too_loud =
        assessmentData.eval_hearing_aid_power_change_too_loud !== undefined
          ? Number(assessmentData.eval_hearing_aid_power_change_too_loud)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_ha_power_change_too_loud, assessmentData.right_ha_power_change_too_loud)

      const eval_hearing_aid_lost_stolen =
        assessmentData.eval_hearing_aid_lost_stolen !== undefined
          ? Number(assessmentData.eval_hearing_aid_lost_stolen)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_ha_lost_or_stolen, assessmentData.right_ha_lost_or_stolen)

      const eval_hearing_aid_no_problem =
        assessmentData.eval_hearing_aid_no_problem !== undefined
          ? Number(assessmentData.eval_hearing_aid_no_problem)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_ha_no_problem, assessmentData.right_ha_no_problem)

      const eval_earmold_discomfort_too_tight =
        assessmentData.eval_earmold_discomfort_too_tight !== undefined
          ? Number(assessmentData.eval_earmold_discomfort_too_tight)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_em_discomfort_too_tight, assessmentData.right_em_discomfort_too_tight)

      const eval_earmold_feedback_too_loose =
        assessmentData.eval_earmold_feedback_too_loose !== undefined
          ? Number(assessmentData.eval_earmold_feedback_too_loose)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_em_feedback_too_loose, assessmentData.right_em_feedback_too_loose)

      const eval_earmold_damaged_tubing_cracked =
        assessmentData.eval_earmold_damaged_tubing_cracked !== undefined
          ? Number(assessmentData.eval_earmold_damaged_tubing_cracked)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_em_damaged_or_tubing_cracked, assessmentData.right_em_damaged_or_tubing_cracked)

      const eval_earmold_lost_stolen =
        assessmentData.eval_earmold_lost_stolen !== undefined
          ? Number(assessmentData.eval_earmold_lost_stolen)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_em_lost_or_stolen, assessmentData.right_em_lost_or_stolen)

      const eval_earmold_no_problem =
        assessmentData.eval_earmold_no_problem !== undefined
          ? Number(assessmentData.eval_earmold_no_problem)
          : Phase3Controller.mapEarConditionsToInteger(assessmentData.left_em_no_problem, assessmentData.right_em_no_problem)

      // services: accept unified service_* if provided; otherwise derive from left/right booleans
      const service_tested_wfa_demo_hearing_aids =
        assessmentData.service_tested_wfa_demo_hearing_aids !== undefined
          ? Number(assessmentData.service_tested_wfa_demo_hearing_aids)
          : (b2i(assessmentData.left_ha_tested_wfa_demo) || b2i(assessmentData.right_ha_tested_wfa_demo) || 0)

      const service_hearing_aid_sent_for_repair_replacement =
        assessmentData.service_hearing_aid_sent_for_repair_replacement !== undefined
          ? Number(assessmentData.service_hearing_aid_sent_for_repair_replacement)
          : (b2i(assessmentData.left_ha_sent_for_repair_replacement) || b2i(assessmentData.right_ha_sent_for_repair_replacement) || 0)

      const service_not_benefiting_from_hearing_aid =
        assessmentData.service_not_benefiting_from_hearing_aid !== undefined
          ? Number(assessmentData.service_not_benefiting_from_hearing_aid)
          : (b2i(assessmentData.left_ha_not_benefiting) || b2i(assessmentData.right_ha_not_benefiting) || 0)

      const service_refit_new_hearing_aid =
        assessmentData.service_refit_new_hearing_aid !== undefined
          ? Number(assessmentData.service_refit_new_hearing_aid)
          : (b2i(assessmentData.left_ha_refit_new) || b2i(assessmentData.right_ha_refit_new) || 0)

      const service_retubed_unplugged_earmold =
        assessmentData.service_retubed_unplugged_earmold !== undefined
          ? Number(assessmentData.service_retubed_unplugged_earmold)
          : (b2i(assessmentData.left_em_retubed_unplugged) || b2i(assessmentData.right_em_retubed_unplugged) || 0)

      const service_modified_earmold =
        assessmentData.service_modified_earmold !== undefined
          ? Number(assessmentData.service_modified_earmold)
          : (b2i(assessmentData.left_em_modified) || b2i(assessmentData.right_em_modified) || 0)

      const service_fit_stock_earmold =
        assessmentData.service_fit_stock_earmold !== undefined
          ? Number(assessmentData.service_fit_stock_earmold)
          : (b2i(assessmentData.left_em_fit_stock) || b2i(assessmentData.right_em_fit_stock) || 0)

      const service_took_new_ear_impression =
        assessmentData.service_took_new_ear_impression !== undefined
          ? Number(assessmentData.service_took_new_ear_impression)
          : (b2i(assessmentData.left_em_took_new_impression) || b2i(assessmentData.right_em_took_new_impression) || 0)

      const service_refit_custom_earmold =
        assessmentData.service_refit_custom_earmold !== undefined
          ? Number(assessmentData.service_refit_custom_earmold)
          : (b2i(assessmentData.left_em_refit_custom) || b2i(assessmentData.right_em_refit_custom) || 0)

      const mappedData = {
        patient_id: Number(assessmentData.patient_id),
        phase_id: 3,
        phase3_reg_id, // ADDED
        completed_by_user_id: Number(assessmentData.completed_by_user_id) || null,
        // unified eval fields
        eval_hearing_aid_dead_broken,
        eval_hearing_aid_internal_feedback,
        eval_hearing_aid_power_change_needed,
        eval_hearing_aid_power_change_too_low,
        eval_hearing_aid_power_change_too_loud,
        eval_hearing_aid_lost_stolen,
        eval_hearing_aid_no_problem,
        eval_earmold_discomfort_too_tight,
        eval_earmold_feedback_too_loose,
        eval_earmold_damaged_tubing_cracked,
        eval_earmold_lost_stolen,
        eval_earmold_no_problem,
        service_tested_wfa_demo_hearing_aids,
        service_hearing_aid_sent_for_repair_replacement,
        service_not_benefiting_from_hearing_aid,
        service_refit_new_hearing_aid,
        service_retubed_unplugged_earmold,
        service_modified_earmold,
        service_fit_stock_earmold,
        service_took_new_ear_impression,
        service_refit_custom_earmold,
        comment: assessmentData.comment || assessmentData.comments || null,
        gs_counseling: assessmentData.counseling_provided === undefined ? null : Boolean(assessmentData.counseling_provided),
        gs_batteries_13_qty: Number(assessmentData.batteries_provided_13) || 0,
        gs_batteries_675_qty: Number(assessmentData.batteries_provided_675) || 0,
        gs_refer_aftercare_service_center: assessmentData.refer_to_aftercare_center === undefined ? null : Boolean(assessmentData.refer_to_aftercare_center),
        gs_refer_next_phase2_mission: assessmentData.refer_to_next_phase2_mission === undefined ? null : Boolean(assessmentData.refer_to_next_phase2_mission),
      }

      // Clean mappedData: keep only columns that exist in aftercare_assessment table
      const colsRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'aftercare_assessment'
      `)
      const tableCols = new Set(colsRes.rows.map((r) => r.column_name))

      const finalMapped = {}
      for (const [key, value] of Object.entries(mappedData)) {
        if (!tableCols.has(key)) {
          // try to handle right-side keys mapping into the DB naming (if DB doesn't have right-specific column)
          if (key.endsWith("_right")) {
            const base = key.replace("_right", "")
            if (tableCols.has(base)) {
              finalMapped[base] = value
            } else {
              console.warn(`Skipping field "${key}" - not present in aftercare_assessment table`)
            }
            continue
          }
          console.warn(`Skipping field "${key}" - not present in aftercare_assessment table`)
          continue
        }
        if (value === undefined || value === null) continue
        if (Array.isArray(value) && value.length === 0) continue
        finalMapped[key] = value
      }

      if (!finalMapped.patient_id || isNaN(finalMapped.patient_id)) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }

      const query = `
        INSERT INTO aftercare_assessment (${Object.keys(finalMapped).join(", ")})
        VALUES (${Object.keys(finalMapped).map((_, i) => `$${i + 1}`).join(", ")})
        RETURNING *
      `

      const result = await client.query(query, Object.values(finalMapped))

      // audit log
      const newId = result.rows[0].assessment_id || null
      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
        ["aftercare_assessment", newId, "CREATE", JSON.stringify(finalMapped), req.user?.user_id || null],
      )

      // Inventory usage - batteries (Phase 3 Aftercare)
      try {
        const qty13 = mappedData.gs_batteries_13_qty || 0
        const qty675 = mappedData.gs_batteries_675_qty || 0
        if (qty13 > 0) {
          await InventoryService.updateStockByCode(
            client,
            "SUP-00100",                 // adjust item_code if different
            -qty13,
            "Used",
            req.user.user_id,
            "Phase 3 Aftercare battery 13 provided",
            { patient_id: mappedData.patient_id, phase_id: 3, related_event_type: "AFTERCARE_BATTERY" }
          )
        }
        if (qty675 > 0) {
          await InventoryService.updateStockByCode(
            client,
            "SUP-00101",
            -qty675,
            "Used",
            req.user.user_id,
            "Phase 3 Aftercare battery 675 provided",
            { patient_id: mappedData.patient_id, phase_id: 3, related_event_type: "AFTERCARE_BATTERY" }
          )
        }
      } catch (invErr) {
        console.warn("Phase3 Aftercare battery deduction failed:", invErr.message)
      }

      await client.query("COMMIT")
      return ResponseHandler.success(res, result.rows[0], "Aftercare assessment created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create aftercare assessment error:", error)
      return ResponseHandler.error(res, "Failed to create aftercare assessment: " + (error?.message || error))
    } finally {
      client.release()
    }
  }

  // Final QC Phase 3 (mapped + validation)
  static async createFinalQC(req, res) {
    const client = await db.getClient()
    try {
      await client.query("BEGIN")

      const qcData = req.body || {}
      qcData.completed_by_user_id = req.user?.user_id
      qcData.phase_id = 3

      const mappedData = {
        patient_id: Number(qcData.patient_id),
        phase_id: 3,
        completed_by_user_id: Number(qcData.completed_by_user_id) || null,
        hearing_aid_satisfaction_18_plus: qcData.satisfaction_with_hearing || qcData.hearing_aid_satisfaction_18_plus || null,
        ask_people_to_repeat_themselves: qcData.asks_to_repeat_or_speak_louder || qcData.ask_people_to_repeat_themselves || null,
        notes_from_shf: qcData.shf_notes || qcData.notes_from_shf || null,
      }

      // remove null/undefined
      Object.keys(mappedData).forEach((k) => {
        if (mappedData[k] === undefined || mappedData[k] === null) delete mappedData[k]
      })

      if (!mappedData.patient_id || isNaN(mappedData.patient_id)) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Patient ID is required", 400)
      }

      const phase3_reg_id = await resolvePhaseRegistrationId(client, 3, qcData.patient_id, qcData.phase3_reg_id);
      mappedData.phase3_reg_id = phase3_reg_id;

      const columns = Object.keys(mappedData).join(", ")
      const placeholders = Object.keys(mappedData).map((_, i) => `$${i + 1}`).join(", ")
      const values = Object.values(mappedData)

      const query = `
        INSERT INTO final_qc_p3 (${columns})
        VALUES (${placeholders})
        RETURNING *
      `

      const result = await client.query(query, values)

      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
        ["final_qc_p3", result.rows[0].final_qc_id, "CREATE", JSON.stringify(mappedData), req.user?.user_id || null],
      )

      await client.query("COMMIT")
      return ResponseHandler.success(res, result.rows[0], "Phase 3 final QC created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create Phase 3 final QC error:", error)
      return ResponseHandler.error(res, "Failed to create Phase 3 final QC: " + (error?.message || error))
    } finally {
      client.release()
    }
  }



  // Get all aftercare assessments

  static async getRegistrations(req, res) {
    try {
      const { patient_id, page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT p3r.*, p.first_name, p.last_name, p.shf_id, u.username as completed_by
        FROM phase3_registration_section p3r
        LEFT JOIN patients p ON p3r.patient_id = p.patient_id
        LEFT JOIN users u ON p3r.completed_by_user_id = u.user_id
      `

      const conditions = []
      const params = []

      if (patient_id) {
        conditions.push(`p3r.patient_id = $${params.length + 1}`)
        params.push(patient_id)
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY p3r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Phase 3 registrations retrieved successfully")
    } catch (error) {
      console.error("Get Phase 3 registrations error:", error)
      return ResponseHandler.error(res, "Failed to retrieve Phase 3 registrations")
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
        params.push(patient_id)
      }

      if (phase_id) {
        conditions.push(`es.phase_id = $${params.length + 1}`)
        params.push(phase_id)
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY es.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Ear screenings retrieved successfully")
    } catch (error) {
      console.error("Get ear screenings error:", error)
      return ResponseHandler.error(res, "Failed to retrieve ear screenings")
    }
  }

  static async getAftercareAssessments(req, res) {
    try {
      const { patient_id, page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT aa.*, p.first_name, p.last_name, p.shf_id, u.username as completed_by
        FROM aftercare_assessment aa
        LEFT JOIN patients p ON aa.patient_id = p.patient_id
        LEFT JOIN users u ON aa.completed_by_user_id = u.user_id
      `

      const conditions = []
      const params = []

      if (patient_id) {
        conditions.push(`aa.patient_id = $${params.length + 1}`)
        params.push(patient_id)
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY aa.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Aftercare assessments retrieved successfully")
    } catch (error) {
      console.error("Get aftercare assessments error:", error)
      return ResponseHandler.error(res, "Failed to retrieve aftercare assessments")
    }
  }

  static async getFinalQCs(req, res) {
    try {
      const { patient_id, page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT fqc.*, p.first_name, p.last_name, p.shf_id, u.username as completed_by
        FROM final_qc_p3 fqc
        LEFT JOIN patients p ON fqc.patient_id = p.patient_id
        LEFT JOIN users u ON fqc.completed_by_user_id = u.user_id
      `

      const conditions = []
      const params = []

      if (patient_id) {
        conditions.push(`fqc.patient_id = $${params.length + 1}`)
        params.push(patient_id)
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY fqc.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Phase 3 final QCs retrieved successfully")
    } catch (error) {
      console.error("Get Phase 3 final QCs error:", error)
      return ResponseHandler.error(res, "Failed to retrieve Phase 3 final QCs")
    }
  }

  static async updateRegistration(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { registrationId } = req.params
      const registrationData = req.body

      // Get current data for audit log
      const currentRegistrationResult = await client.query(
        "SELECT * FROM phase3_registration_section WHERE phase3_reg_id = $1",
        [registrationId]
      )

      if (currentRegistrationResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Phase 3 registration not found")
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
      values.push(registrationId) // Add registrationId for WHERE clause

      const query = `
        UPDATE phase3_registration_section 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE phase3_reg_id = $${values.length}
        RETURNING *
      `

      const result = await client.query(query, values)
      const updatedRegistration = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "phase3_registration_section",
          registrationId,
          "UPDATE",
          JSON.stringify(currentRegistration),
          JSON.stringify(updatedRegistration),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedRegistration, "Phase 3 registration updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update Phase 3 registration error:", error)
      return ResponseHandler.error(res, "Failed to update Phase 3 registration")
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
        [screeningId]
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
      values.push(screeningId) // Add screeningId for WHERE clause

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

  static async updateAftercareAssessment(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { assessmentId } = req.params
      const updateData = req.body

      // Get current data for audit
      const currentResult = await client.query("SELECT * FROM aftercare_assessment WHERE assessment_id = $1", [
        assessmentId,
      ])

      if (currentResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Aftercare assessment not found")
      }

      const currentData = currentResult.rows[0]

      // Build update query
      const updateFields = Object.keys(updateData)
      const setClause = updateFields.map((field, index) => `${field} = $${index + 2}`).join(", ")
      const values = [assessmentId, ...Object.values(updateData)]

      const updateQuery = `
        UPDATE aftercare_assessment 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE assessment_id = $1
        RETURNING *
      `

      const result = await client.query(updateQuery, values)

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "aftercare_assessment",
          assessmentId,
          "UPDATE",
          JSON.stringify(currentData),
          JSON.stringify(result.rows[0]),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "Aftercare assessment updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update aftercare assessment error:", error)
      return ResponseHandler.error(res, "Failed to update aftercare assessment")
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
        "SELECT * FROM final_qc_p3 WHERE final_qc_id = $1",
        [qcId]
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
      values.push(qcId) // Add qcId for WHERE clause

      const query = `
        UPDATE final_qc_p3 
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
          "final_qc_p3",
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
      console.error("Update Final QC error:", error)
      return ResponseHandler.error(res, "Failed to update Final QC")
    } finally {
      client.release()
    }
  }  
  
  
  // Get complete Phase 3 data for a patient
  static async getPhase3Data(req, res) {
    try {
      const { patientId, regId } = req.params;
      const baseParams = [Number(patientId)];
      let phase3RegId = regId ? Number(regId) : null;

      if (!phase3RegId) {
        const r = await db.query(
          `SELECT phase3_reg_id FROM phase3_registration_section
           WHERE patient_id = $1 ORDER BY registration_date DESC, created_at DESC LIMIT 1`,
          baseParams
        );
        phase3RegId = r.rows[0]?.phase3_reg_id || null;
      }

      const regFilter = phase3RegId ? "AND phase3_reg_id = $2" : "";
      const params = phase3RegId ? [Number(patientId), phase3RegId] : [Number(patientId)];

      const queries = {
        registration: `
          SELECT * FROM phase3_registration_section
          WHERE patient_id = $1 ${phase3RegId ? "AND phase3_reg_id = $2" : ""}
          ORDER BY created_at DESC LIMIT 1
        `,
        earScreening: `
          SELECT * FROM ear_screening
          WHERE patient_id = $1 AND phase_id = 3 ${regFilter}
          ORDER BY created_at DESC
        `,
        aftercareAssessment: `
          SELECT * FROM aftercare_assessment
          WHERE patient_id = $1 ${regFilter}
          ORDER BY created_at DESC LIMIT 1
        `,
        finalQC: `
          SELECT * FROM final_qc_p3
          WHERE patient_id = $1 ${regFilter}
          ORDER BY created_at DESC LIMIT 1
        `
      };

      const results = {};
      for (const [k, q] of Object.entries(queries)) {
        const r = await db.query(q, params);
        results[k] = k === "earScreening" ? r.rows : r.rows[0] || null;
      }

      return ResponseHandler.success(res, { phase3_reg_id: phase3RegId, ...results }, "Phase 3 data retrieved");
    } catch (e) {
      console.error("getPhase3Data error:", e);
      return ResponseHandler.error(res, "Failed to retrieve Phase 3 data");
    }
  }

  // ADD NEW: resume fetch controller
  static async getPhase3ResumeData(req, res) {
    const client = await db.getClient()
    try {
      const pid = Number(req.params.patientId)
      if (!pid) return ResponseHandler.error(res, "Invalid patient ID", 400)

      // Resolve latest phase3_reg_id if not supplied or is 0
      const provided = req.params.regId
      const phase3_reg_id = await resolvePhaseRegistrationId(client, 3, pid, provided)

      if (!phase3_reg_id) {
        return ResponseHandler.success(
          res,
          {
            phase3_reg_id: null,
            sections: { registration: null, earScreening: [], aftercareAssessment: null, finalQC: null },
            completeness: { registration: false, earScreening: false, aftercareAssessment: false, finalQC: false },
            all_complete: false,
          },
          "No Phase 3 registration yet"
        )
      }

      const params = [pid, phase3_reg_id]

      // Registration
      const regQ = await client.query(
        `SELECT *
           FROM phase3_registration_section
          WHERE patient_id = $1 AND phase3_reg_id = $2
          LIMIT 1`,
        params
      )
      const registration = regQ.rows[0] || null

      // Ear screening (Phase 3 only)
      const earQ = await client.query(
        `SELECT *
           FROM ear_screening
          WHERE patient_id = $1 AND phase_id = 3 AND phase3_reg_id = $2
          ORDER BY created_at DESC`,
        params
      )
      const earScreening = earQ.rows || []

      // Aftercare assessment (ensure table has phase3_reg_id)
      const aftercareQ = await client.query(
        `SELECT *
           FROM aftercare_assessment
          WHERE patient_id = $1 AND phase3_reg_id = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        params
      )
      const aftercareAssessment = aftercareQ.rows[0] || null

      // Final QC (Phase 3 table, scoped to reg)
      const finalQ = await client.query(
        `SELECT *
           FROM final_qc_p3
          WHERE patient_id = $1 AND phase3_reg_id = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        params
      )
      const finalQC = finalQ.rows[0] || null

      const completeness = {
        registration: !!registration,
        earScreening: earScreening.length > 0,
        aftercareAssessment: !!aftercareAssessment,
        finalQC: !!finalQC,
      }
      const all_complete = Object.values(completeness).every(Boolean)

      return ResponseHandler.success(
        res,
        {
          phase3_reg_id,
          sections: { registration, earScreening, aftercareAssessment, finalQC },
          completeness,
          all_complete,
        },
        "Phase 3 resume data retrieved"
      )
    } catch (e) {
      console.error("getPhase3ResumeData error:", e)
      return ResponseHandler.error(res, "Failed to retrieve resume data")
    } finally {
      client.release()
    }
  }

  // NEW: Get all Phase 3 sections by patient + registration id
  static async getPhase3Sections(req, res) {
    try {
      const patientId = Number(req.params.patientId)
      const regId = Number(req.params.regId)

      if (!patientId || !regId) {
        return ResponseHandler.error(res, "Invalid patient or registration id", 400)
      }

      // Verify registration belongs to patient
      const regResult = await db.query(
        `SELECT * FROM phase3_registration_section
         WHERE patient_id = $1 AND phase3_reg_id = $2
         LIMIT 1`,
        [patientId, regId]
      )
      const registration = regResult.rows[0] || null
      if (!registration) {
        return ResponseHandler.notFound(res, "Phase 3 registration not found for patient")
      }

      const earScreeningsRes = await db.query(
        `SELECT * FROM ear_screening
         WHERE patient_id = $1 AND phase_id = 3 AND phase3_reg_id = $2
         ORDER BY created_at DESC`,
        [patientId, regId]
      )

      const aftercareRes = await db.query(
        `SELECT * FROM aftercare_assessment
         WHERE patient_id = $1 AND phase3_reg_id = $2
         ORDER BY created_at DESC`,
        [patientId, regId]
      )

      const finalQCRes = await db.query(
        `SELECT * FROM final_qc_p3
         WHERE patient_id = $1 AND phase3_reg_id = $2
         ORDER BY created_at DESC`,
        [patientId, regId]
      )

      const sections = {
        registration,
        earScreenings: earScreeningsRes.rows,
        aftercareAssessments: aftercareRes.rows,
        finalQCs: finalQCRes.rows,
      }

      const completeness = {
        registration: !!registration,
        earScreening: sections.earScreenings.length > 0,
        aftercareAssessment: sections.aftercareAssessments.length > 0,
        finalQC: sections.finalQCs.length > 0,
      }

      const all_complete = Object.values(completeness).every(Boolean)

      return ResponseHandler.success(
        res,
        {
          patient_id: patientId,
          phase3_reg_id: regId,
          sections,
          completeness,
          all_complete,
        },
        "Phase 3 sections retrieved",
      )
    } catch (e) {
      console.error("getPhase3Sections error:", e)
      return ResponseHandler.error(res, "Failed to retrieve Phase 3 sections")
    }
  }
}

module.exports = Phase3Controller