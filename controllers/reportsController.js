const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

class ReportingController {
  static buildCommonFilters(
    { city, gender, status, dateStart, dateEnd },
    startingIndex = 1,
    dateExpr,
    cols = { city: "city_val", gender: "p.gender", status: "pp.status" }
  ) {
    const whereClauses = []
    const params = []
    let idx = startingIndex

    const cityCol = cols.city || "city_val"
    const genderCol = cols.gender || "p.gender"
    const statusCol = cols.status || "pp.status"

    if (city) {
      whereClauses.push(`LOWER(${cityCol}) LIKE $${idx++}`)
      params.push(`%${city.toLowerCase()}%`)
    }
    if (gender) {
      whereClauses.push(`LOWER(${genderCol}) = $${idx++}`)
      params.push(gender.toLowerCase())
    }
    if (status) {
      whereClauses.push(`LOWER(${statusCol}) = $${idx++}`)
      params.push(status.toLowerCase())
    }
    if (dateStart && dateEnd) {
      whereClauses.push(`${dateExpr} BETWEEN $${idx++} AND $${idx++}`)
      params.push(dateStart, dateEnd)
    } else if (dateStart) {
      whereClauses.push(`${dateExpr} >= $${idx++}`)
      params.push(dateStart)
    } else if (dateEnd) {
      whereClauses.push(`${dateExpr} <= $${idx++}`)
      params.push(dateEnd)
    }
    return { whereClauses, params, nextIndex: idx }
  }

  static async generatePatientReport(req, res) {
    try {
      const { phaseId, city, status, dateStart, dateEnd } = req.query

      const detailedPhase = Number(phaseId)
      if (detailedPhase === 1 || detailedPhase === 2 || detailedPhase === 3) {
        let queryParams = []
        let paramIndex = 1

        let whereClauses = [`pp.phase_id = $${paramIndex++}`]
        queryParams.push(detailedPhase)

        if (city) {
          const cityColumn =
            detailedPhase === 1
              ? 'p1.city'
              : detailedPhase === 2
              ? 'p2.city'
              : 'p3.city'
          whereClauses.push(`${cityColumn} ILIKE $${paramIndex++}`)
          queryParams.push(`%${city}%`)
        }
        if (status) {
          whereClauses.push(`pp.status = $${paramIndex++}`)
          queryParams.push(status)
        }
        if (dateStart && dateEnd) {
          whereClauses.push(`pp.phase_start_date BETWEEN $${paramIndex++} AND $${paramIndex++}`)
          queryParams.push(dateStart, dateEnd)
        } else if (dateStart) {
          whereClauses.push(`pp.phase_start_date >= $${paramIndex++}`)
          queryParams.push(dateStart)
        } else if (dateEnd) {
          whereClauses.push(`pp.phase_start_date <= $${paramIndex++}`)
          queryParams.push(dateEnd)
        }

        // New gender filter for detailed report
        if (req.query.gender) {
          whereClauses.push(`LOWER(p.gender) = $${paramIndex++}`)
          queryParams.push(String(req.query.gender).toLowerCase())
        }

        let phaseSelect = ``
        let phaseJoins = ``

        if (detailedPhase === 1) {
          phaseSelect = `
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
            hs1.screening_method        AS p1_hs_method,
            hs1.left_ear_result         AS p1_hs_left_result,
            hs1.right_ear_result        AS p1_hs_right_result,
            hs1.hearing_satisfaction_18_plus_pass AS p1_hs_satisfaction_pass,
            ei.ear_impression           AS p1_ear_impression,
            ei.comment                  AS p1_ear_impression_comment,
            q1.ear_impressions_inspected_collected AS p1_qc_impressions_collected,
            q1.shf_id_number_id_card_given         AS p1_qc_id_card_given
          `
          phaseJoins = `
            LEFT JOIN LATERAL (
              SELECT *
              FROM phase1_registration_section r
              WHERE r.patient_id = p.patient_id AND r.phase_id = 1
              ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST
              LIMIT 1
            ) p1 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM ear_screening es
              WHERE es.patient_id = p.patient_id AND es.phase_id = 1
              ORDER BY es.updated_at DESC NULLS LAST, es.created_at DESC NULLS LAST
              LIMIT 1
            ) es1 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM hearing_screening hs
              WHERE hs.patient_id = p.patient_id AND hs.phase_id = 1
              ORDER BY hs.updated_at DESC NULLS LAST, hs.created_at DESC NULLS LAST
              LIMIT 1
            ) hs1 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM ear_impressions ei
              WHERE ei.patient_id = p.patient_id AND ei.phase_id = 1
              ORDER BY ei.updated_at DESC NULLS LAST, ei.created_at DESC NULLS LAST
              LIMIT 1
            ) ei ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM final_qc_p1 q
              WHERE q.patient_id = p.patient_id AND q.phase_id = 1
              ORDER BY q.updated_at DESC NULLS LAST, q.created_at DESC NULLS LAST
              LIMIT 1
            ) q1 ON TRUE
          `
        } else if (detailedPhase === 2) {
          phaseSelect = `
            p2.registration_date        AS p2_registration_date,
            p2.city                     AS p2_city,
            p2.patient_type             AS p2_patient_type,
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
            c2.received_aftercare_information AS p2_c_received_aftercare_info,
            c2.trained_as_student_ambassador  AS p2_c_trained_student_amb,
            q2.batteries_provided_13      AS p2_qc_batt_13,
            q2.batteries_provided_675     AS p2_qc_batt_675,
            q2.hearing_aid_satisfaction_18_plus AS p2_qc_satisfaction_18_plus,
            q2.confirmation               AS p2_qc_confirmation,
            q2.qc_comments                AS p2_qc_comments,
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
            hs2.screening_method          AS p2_hs_method,
            hs2.left_ear_result           AS p2_hs_left_result,
            hs2.right_ear_result          AS p2_hs_right_result,
            hs2.hearing_satisfaction_18_plus_pass AS p2_hs_satisfaction_pass
          `
          phaseJoins = `
            LEFT JOIN LATERAL (
              SELECT *
              FROM phase2_registration_section r
              WHERE r.patient_id = p.patient_id AND r.phase_id = 2
              ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST
              LIMIT 1
            ) p2 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM fitting_table ft0
              WHERE ft0.patient_id = p.patient_id AND ft0.phase_id = 2
              ORDER BY ft0.updated_at DESC NULLS LAST, ft0.created_at DESC NULLS LAST
              LIMIT 1
            ) ft ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM fitting f
              WHERE f.patient_id = p.patient_id AND f.phase_id = 2
              ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC NULLS LAST
              LIMIT 1
            ) f2 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM counseling c
              WHERE c.patient_id = p.patient_id AND c.phase_id = 2
              ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST
              LIMIT 1
            ) c2 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM final_qc_p2 q
              WHERE q.patient_id = p.patient_id AND q.phase_id = 2
              ORDER BY q.updated_at DESC NULLS LAST, q.created_at DESC NULLS LAST
              LIMIT 1
            ) q2 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM ear_screening es
              WHERE es.patient_id = p.patient_id AND es.phase_id = 2
              ORDER BY es.updated_at DESC NULLS LAST, es.created_at DESC NULLS LAST
              LIMIT 1
            ) es2 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM hearing_screening hs
              WHERE hs.patient_id = p.patient_id AND hs.phase_id = 2
              ORDER BY hs.updated_at DESC NULLS LAST, hs.created_at DESC NULLS LAST
              LIMIT 1
            ) hs2 ON TRUE
          `
        } else {
          phaseSelect = `
            p3.registration_date           AS p3_registration_date,
            p3.country                     AS p3_country,
            p3.city                        AS p3_city,
            p3.type_of_aftercare           AS p3_type_of_aftercare,
            p3.service_center_school_name  AS p3_service_center_school_name,
            p3.return_visit_custom_earmold_repair AS p3_return_visit_custom_earmold_repair,
            p3.problem_with_hearing_aid_earmold   AS p3_problem_with_hearing_aid_earmold,
            a3.eval_hearing_aid_dead_broken       AS p3_eval_aid_dead_broken,
            a3.eval_hearing_aid_internal_feedback AS p3_eval_aid_internal_feedback,
            a3.eval_hearing_aid_power_change_needed AS p3_eval_aid_power_change_needed,
            a3.eval_hearing_aid_power_change_too_low AS p3_eval_aid_power_change_too_low,
            a3.eval_hearing_aid_power_change_too_loud AS p3_eval_aid_power_change_too_loud,
            a3.eval_hearing_aid_lost_stolen       AS p3_eval_aid_lost_stolen,
            a3.eval_hearing_aid_no_problem        AS p3_eval_aid_no_problem,
            a3.eval_earmold_discomfort_too_tight  AS p3_eval_earmold_discomfort_too_tight,
            a3.eval_earmold_feedback_too_loose    AS p3_eval_earmold_feedback_too_loose,
            a3.eval_earmold_damaged_tubing_cracked AS p3_eval_earmold_damaged_tubing_cracked,
            a3.eval_earmold_lost_stolen           AS p3_eval_earmold_lost_stolen,
            a3.eval_earmold_no_problem            AS p3_eval_earmold_no_problem,
            a3.service_tested_wfa_demo_hearing_aids AS p3_service_tested_wfa_demo_hearing_aids,
            a3.service_hearing_aid_sent_for_repair_replacement AS p3_service_sent_for_repair,
            a3.service_not_benefiting_from_hearing_aid AS p3_service_not_benefiting,
            a3.service_refit_new_hearing_aid       AS p3_service_refit_new_aid,
            a3.service_retubed_unplugged_earmold   AS p3_service_retubed_unplugged_earmold,
            a3.service_modified_earmold            AS p3_service_modified_earmold,
            a3.service_fit_stock_earmold           AS p3_service_fit_stock_earmold,
            a3.service_took_new_ear_impression     AS p3_service_took_new_ear_impression,
            a3.service_refit_custom_earmold        AS p3_service_refit_custom_earmold,
            a3.gs_counseling                       AS p3_gs_counseling,
            a3.gs_batteries_provided               AS p3_gs_batteries_provided,
            a3.gs_batteries_13_qty                 AS p3_gs_batteries_13_qty,
            a3.gs_batteries_675_qty                AS p3_gs_batteries_675_qty,
            a3.gs_refer_aftercare_service_center   AS p3_gs_refer_aftercare_center,
            a3.gs_refer_next_phase2_mission        AS p3_gs_refer_next_phase2_mission,
            a3.comment                             AS p3_comment,
            q3.hearing_aid_satisfaction_18_plus    AS p3_qc_satisfaction_18_plus,
            q3.ask_people_to_repeat_themselves     AS p3_qc_ask_repeat,
            q3.notes_from_shf                      AS p3_qc_notes,
            es3.ears_clear                         AS p3_es_ears_clear,
            es3.otc_wax                            AS p3_es_otc_wax,
            es3.otc_infection                      AS p3_es_otc_infection,
            es3.otc_perforation                    AS p3_es_otc_perforation,
            es3.otc_tinnitus                       AS p3_es_otc_tinnitus,
            es3.otc_atresia                        AS p3_es_otc_atresia,
            es3.otc_implant                        AS p3_es_otc_implant,
            es3.otc_other                          AS p3_es_otc_other,
            es3.medical_recommendation             AS p3_es_medical_recommendation,
            es3.medication_given                   AS p3_es_medication_given,
            es3.left_ear_clear_for_fitting AS p3_es_left_clear_for_fitting,
            es3.right_ear_clear_for_fitting AS p3_es_right_clear_for_fitting,
            es3.comments                AS p3_es_comments,
            a3.created_at AS p3_assessment_created_at
          `
          phaseJoins = `
            LEFT JOIN LATERAL (
              SELECT *
              FROM phase3_registration_section r
              WHERE r.patient_id = p.patient_id AND r.phase_id = 3
              ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST
              LIMIT 1
            ) p3 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM aftercare_assessment a
              WHERE a.patient_id = p.patient_id AND a.phase_id = 3
              ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST
              LIMIT 1
            ) a3 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM final_qc_p3 q
              WHERE q.patient_id = p.patient_id AND q.phase_id = 3
              ORDER BY q.updated_at DESC NULLS LAST, q.created_at DESC NULLS LAST
              LIMIT 1
            ) q3 ON TRUE
            LEFT JOIN LATERAL (
              SELECT *
              FROM ear_screening es
              WHERE es.patient_id = p.patient_id AND es.phase_id = 3
              ORDER BY es.updated_at DESC NULLS LAST, es.created_at DESC NULLS LAST
              LIMIT 1
            ) es3 ON TRUE
          `
        }

        const finalQuery = `
          SELECT
            p.patient_id,
            p.shf_id,
            p.first_name,
            p.last_name,
            p.gender,
            p.date_of_birth,
            pp.phase_id,
            pp.status,
            pp.phase_start_date,
            pp.phase_end_date,
            ${phaseSelect}
          FROM patients p
          LEFT JOIN patient_phases pp 
            ON p.patient_id = pp.patient_id AND pp.phase_id = $1
          ${phaseJoins}
          ${whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : ""}
          ORDER BY pp.phase_start_date DESC NULLS LAST, p.last_name
        `

        const { rows } = await db.query(finalQuery, queryParams)
        return ResponseHandler.success(res, rows, "Patient report (detailed) generated successfully")
      }

      // Fallback: existing lightweight report when no specific phase is requested
      let queryParams = []
      let paramIndex = 1

      let baseQuery = `
        SELECT 
          p.patient_id, 
          p.shf_id, 
          p.first_name, 
          p.last_name, 
          p.gender,
          p.date_of_birth,
          pp.phase_id, 
          pp.status, 
          pp.phase_start_date,
          pp.phase_end_date,
          COALESCE(p1.city, p2.city, p3.city) as registration_city
        FROM patients p
        LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id
        LEFT JOIN phase1_registration_section p1 ON p.patient_id = p1.patient_id
        LEFT JOIN phase2_registration_section p2 ON p.patient_id = p2.patient_id
        LEFT JOIN phase3_registration_section p3 ON p.patient_id = p3.patient_id
      `

      let whereClauses = []

      if (phaseId && phaseId !== "all") {
        whereClauses.push(`pp.phase_id = $${paramIndex++}`)
        queryParams.push(phaseId)
      }
      if (city) {
        whereClauses.push(`COALESCE(p1.city, p2.city, p3.city) ILIKE $${paramIndex++}`)
        queryParams.push(`%${city}%`)
      }
      if (status) {
        whereClauses.push(`pp.status = $${paramIndex++}`)
        queryParams.push(status)
      }
      if (dateStart && dateEnd) {
        whereClauses.push(`pp.phase_start_date BETWEEN $${paramIndex++} AND $${paramIndex++}`)
        queryParams.push(dateStart, dateEnd)
      } else if (dateStart) {
        whereClauses.push(`pp.phase_start_date >= $${paramIndex++}`)
        queryParams.push(dateStart)
      } else if (dateEnd) {
        whereClauses.push(`pp.phase_start_date <= $${paramIndex++}`)
        queryParams.push(dateEnd)
      }

      // Fallback gender filter
      if (req.query.gender) {
        whereClauses.push(`LOWER(p.gender) = $${paramIndex++}`)
        queryParams.push(String(req.query.gender).toLowerCase())
      }

      let finalQuery = baseQuery
      if (whereClauses.length > 0) {
        finalQuery += ` WHERE ${whereClauses.join(" AND ")}`
      }
      finalQuery += ` ORDER BY pp.phase_start_date DESC, p.last_name`

      const { rows } = await db.query(finalQuery, queryParams)
      return ResponseHandler.success(res, rows, "Patient report generated successfully")
    } catch (error) {
      console.error("Patient report generation error:", error)
      return ResponseHandler.error(res, "Failed to generate patient report")
    }
  }

  static async generateSummaryReport(req, res) {
    try {
      const { city, dateStart, dateEnd } = req.query

      let queryParams = []
      let paramIndex = 1

      // Base query for aggregation
      let baseQuery = `
        SELECT 
          pp.phase_id, 
          ph.phase_name,
          pp.status, 
          COUNT(p.patient_id) as patient_count
        FROM patients p
        JOIN patient_phases pp ON p.patient_id = pp.patient_id
        JOIN phases ph ON pp.phase_id = ph.phase_id
        -- We join these to be able to filter by city
        LEFT JOIN phase1_registration_section p1 ON p.patient_id = p1.patient_id
        LEFT JOIN phase2_registration_section p2 ON p.patient_id = p2.patient_id
        LEFT JOIN phase3_registration_section p3 ON p.patient_id = p3.patient_id
      `

      let whereClauses = []

      // Add filters dynamically
      if (city) {
        whereClauses.push(`COALESCE(p1.city, p2.city, p3.city) ILIKE $${paramIndex++}`)
        queryParams.push(`%${city}%`)
      }

      if (dateStart && dateEnd) {
        whereClauses.push(`pp.phase_start_date BETWEEN $${paramIndex++} AND $${paramIndex++}`)
        queryParams.push(dateStart, dateEnd)
      } else if (dateStart) {
        whereClauses.push(`pp.phase_start_date >= $${paramIndex++}`)
        queryParams.push(dateStart)
      } else if (dateEnd) {
        whereClauses.push(`pp.phase_start_date <= $${paramIndex++}`)
        queryParams.push(dateEnd)
      }

      // Assemble the final query
      let finalQuery = baseQuery
      if (whereClauses.length > 0) {
        finalQuery += ` WHERE ${whereClauses.join(" AND ")}`
      }

      // Add GROUP BY
      finalQuery += ` 
        GROUP BY pp.phase_id, ph.phase_name, pp.status
        ORDER BY pp.phase_id, pp.status
      `

      const { rows } = await db.query(finalQuery, queryParams)

      return ResponseHandler.success(res, rows, "Summary report generated successfully")
    } catch (error) {
      console.error("Summary report generation error:", error)
      return ResponseHandler.error(res, "Failed to generate summary report")
    }
  }

  static async exportPhase1(req, res) {
    try {
      const { city, gender, status, dateStart, dateEnd } = req.query
      const base = `
        SELECT
          p.patient_id,
          p.shf_id,
          p.first_name,
          p.last_name,
          p.gender,
          p.date_of_birth,
          pp.status,
          pp.phase_start_date,
          pp.phase_end_date,
          p1.registration_date AS p1_registration_date,
          p1.city AS p1_city,
          COALESCE(p1.city,'') AS city_val,
          p1.has_hearing_loss,
          p1.uses_sign_language,
          p1.uses_speech,
          p1.hearing_loss_causes,
          p1.ringing_sensation,
          p1.ear_pain,
          p1.hearing_satisfaction_18_plus,
          p1.conversation_difficulty,
          es.ears_clear AS p1_es_ears_clear,
          es.otc_wax AS p1_es_otc_wax,
          es.otc_infection AS p1_es_otc_infection,
          es.otc_perforation AS p1_es_otc_perforation,
          es.otc_tinnitus AS p1_es_otc_tinnitus,
          es.otc_atresia AS p1_es_otc_atresia,
          es.otc_implant AS p1_es_otc_implant,
          es.otc_other AS p1_es_otc_other,
          es.medical_recommendation AS p1_es_medical_recommendation,
          es.medication_given AS p1_es_medication_given,
          es.left_ear_clear_for_fitting AS p1_es_left_clear_for_fitting,
          es.right_ear_clear_for_fitting AS p1_es_right_clear_for_fitting,
          es.comments AS p1_es_comments,
          hs.screening_method AS p1_hs_method,
          hs.left_ear_result AS p1_hs_left_result,
          hs.right_ear_result AS p1_hs_right_result,
          hs.hearing_satisfaction_18_plus_pass AS p1_hs_satisfaction_pass,
          ei.ear_impression AS p1_ear_impression,
          ei.comment AS p1_ear_impression_comment,
          q1.ear_impressions_inspected_collected AS p1_qc_impressions_collected,
          q1.shf_id_number_id_card_given AS p1_qc_id_card_given
        FROM patients p
        LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id AND pp.phase_id = 1
        LEFT JOIN phase1_registration_section p1 ON p.patient_id = p1.patient_id
        LEFT JOIN ear_screening es ON es.patient_id = p.patient_id AND es.phase_id = 1
        LEFT JOIN hearing_screening hs ON hs.patient_id = p.patient_id AND hs.phase_id = 1
        LEFT JOIN ear_impressions ei ON ei.patient_id = p.patient_id AND ei.phase_id = 1
        LEFT JOIN final_qc_p1 q1 ON q1.patient_id = p.patient_id AND q1.phase_id = 1
      `
      const { whereClauses, params } = ReportingController.buildCommonFilters(
        { city, gender, status, dateStart, dateEnd },
        1,
        'COALESCE(p1.registration_date, pp.phase_start_date)',
        { city: 'p1.city', gender: 'p.gender', status: 'pp.status' }
      )
      const final = base + (whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '') + ' ORDER BY p.last_name'
      const { rows } = await db.query(final, params)
      return ResponseHandler.success(res, rows, 'Phase 1 export generated')
    } catch (e) {
      console.error(e)
      return ResponseHandler.error(res, 'Failed to export Phase 1')
    }
  }

  static async exportPhase2(req, res) {
    try {
      const { city, gender, status, dateStart, dateEnd } = req.query
      const base = `
        SELECT
          p.patient_id,
          p.shf_id,
          p.first_name,
          p.last_name,
          p.gender,
          p.date_of_birth,
          pp.status,
          pp.phase_start_date,
          pp.phase_end_date,
          p2.registration_date AS p2_registration_date,
          p2.city AS p2_city,
          COALESCE(p2.city,'') AS city_val,
          p2.patient_type AS p2_patient_type,
          ft.fitting_left_power_level AS p2_ft_left_power_level,
          ft.fitting_left_volume AS p2_ft_left_volume,
          ft.fitting_left_model AS p2_ft_left_model,
          ft.fitting_left_battery AS p2_ft_left_battery,
          ft.fitting_left_earmold AS p2_ft_left_earmold,
          ft.fitting_right_power_level AS p2_ft_right_power_level,
          ft.fitting_right_volume AS p2_ft_right_volume,
          ft.fitting_right_model AS p2_ft_right_model,
          ft.fitting_right_battery AS p2_ft_right_battery,
          ft.fitting_right_earmold AS p2_ft_right_earmold,
          f2.number_of_hearing_aid AS p2_f_number_of_hearing_aid,
          f2.special_device AS p2_f_special_device,
          f2.normal_hearing AS p2_f_normal_hearing,
          f2.distortion AS p2_f_distortion,
          f2.implant AS p2_f_implant,
          f2.recruitment AS p2_f_recruitment,
          f2.no_response AS p2_f_no_response,
          f2.other AS p2_f_other,
          f2.comment AS p2_f_comment,
          f2.clear_for_counseling AS p2_f_clear_for_counseling,
          c2.received_aftercare_information AS p2_c_received_aftercare_info,
          c2.trained_as_student_ambassador AS p2_c_trained_student_amb,
          q2.batteries_provided_13 AS p2_qc_batt_13,
          q2.batteries_provided_675 AS p2_qc_batt_675,
          q2.hearing_aid_satisfaction_18_plus AS p2_qc_satisfaction_18_plus,
          q2.confirmation AS p2_qc_confirmation,
          q2.qc_comments AS p2_qc_comments,
          es2.ears_clear AS p2_es_ears_clear,
          es2.otc_wax AS p2_es_otc_wax,
          es2.otc_infection AS p2_es_otc_infection,
          es2.otc_perforation AS p2_es_otc_perforation,
          es2.otc_tinnitus AS p2_es_otc_tinnitus,
          es2.otc_atresia AS p2_es_otc_atresia,
          es2.otc_implant AS p2_es_otc_implant,
          es2.otc_other AS p2_es_otc_other,
          es2.medical_recommendation AS p2_es_medical_recommendation,
          es2.medication_given AS p2_es_medication_given
        FROM patients p
        LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id AND pp.phase_id = 2
        LEFT JOIN phase2_registration_section p2 ON p.patient_id = p2.patient_id
        LEFT JOIN fitting_table ft ON ft.patient_id = p.patient_id AND ft.phase_id = 2
        LEFT JOIN fitting f2 ON f2.patient_id = p.patient_id AND f2.phase_id = 2
        LEFT JOIN counseling c2 ON c2.patient_id = p.patient_id AND c2.phase_id = 2
        LEFT JOIN final_qc_p2 q2 ON q2.patient_id = p.patient_id AND q2.phase_id = 2
        LEFT JOIN ear_screening es2 ON es2.patient_id = p.patient_id AND es2.phase_id = 2
      `
      const { whereClauses, params } = ReportingController.buildCommonFilters(
        { city, gender, status, dateStart, dateEnd },
        1,
        'COALESCE(p2.registration_date, pp.phase_start_date)',
        { city: 'p2.city', gender: 'p.gender', status: 'pp.status' }
      )
      const final = base + (whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '') + ' ORDER BY p.last_name'
      const { rows } = await db.query(final, params)
      return ResponseHandler.success(res, rows, 'Phase 2 export generated')
    } catch (e) {
      console.error(e)
      return ResponseHandler.error(res, 'Failed to export Phase 2')
    }
  }

  static async exportPhase3(req, res) {
    try {
      const { city, gender, status, dateStart, dateEnd } = req.query
      const base = `
        SELECT
          a3.assessment_id,
          p.patient_id,
          p.shf_id,
          p.first_name,
          p.last_name,
          p.gender,
          p.date_of_birth,
          pp.status,
          pp.phase_start_date,
          pp.phase_end_date,
          p3.registration_date AS p3_registration_date,
          p3.country AS p3_country,
          p3.city AS p3_city,
          COALESCE(p3.city,'') AS city_val,
          p3.type_of_aftercare AS p3_type_of_aftercare,
          p3.service_center_school_name AS p3_service_center_school_name,
          p3.return_visit_custom_earmold_repair AS p3_return_visit_custom_earmold_repair,
          p3.problem_with_hearing_aid_earmold AS p3_problem_with_hearing_aid_earmold,
          a3.eval_hearing_aid_dead_broken AS p3_eval_aid_dead_broken,
          a3.eval_hearing_aid_internal_feedback AS p3_eval_aid_internal_feedback,
          a3.eval_hearing_aid_power_change_needed AS p3_eval_aid_power_change_needed,
          a3.eval_hearing_aid_power_change_too_low AS p3_eval_aid_power_change_too_low,
          a3.eval_hearing_aid_power_change_too_loud AS p3_eval_aid_power_change_too_loud,
          a3.eval_hearing_aid_lost_stolen AS p3_eval_aid_lost_stolen,
          a3.eval_hearing_aid_no_problem AS p3_eval_aid_no_problem,
          a3.eval_earmold_discomfort_too_tight AS p3_eval_earmold_discomfort_too_tight,
          a3.eval_earmold_feedback_too_loose AS p3_eval_earmold_feedback_too_loose,
          a3.eval_earmold_damaged_tubing_cracked AS p3_eval_earmold_damaged_tubing_cracked,
          a3.eval_earmold_lost_stolen AS p3_eval_earmold_lost_stolen,
          a3.eval_earmold_no_problem AS p3_eval_earmold_no_problem,
          a3.service_tested_wfa_demo_hearing_aids AS p3_service_tested_wfa_demo_hearing_aids,
          a3.service_hearing_aid_sent_for_repair_replacement AS p3_service_sent_for_repair,
          a3.service_not_benefiting_from_hearing_aid AS p3_service_not_benefiting,
          a3.service_refit_new_hearing_aid AS p3_service_refit_new_aid,
          a3.service_retubed_unplugged_earmold AS p3_service_retubed_unplugged_earmold,
          a3.service_modified_earmold AS p3_service_modified_earmold,
          a3.service_fit_stock_earmold AS p3_service_fit_stock_earmold,
          a3.service_took_new_ear_impression AS p3_service_took_new_ear_impression,
          a3.service_refit_custom_earmold AS p3_service_refit_custom_earmold,
          a3.gs_counseling AS p3_gs_counseling,
          a3.gs_batteries_provided AS p3_gs_batteries_provided,
          a3.gs_batteries_13_qty AS p3_gs_batteries_13_qty,
          a3.gs_batteries_675_qty AS p3_gs_batteries_675_qty,
          a3.gs_refer_aftercare_service_center AS p3_gs_refer_aftercare_center,
          a3.gs_refer_next_phase2_mission AS p3_gs_refer_next_phase2_mission,
          a3.comment AS p3_aftercare_comment,
          q3.hearing_aid_satisfaction_18_plus AS p3_qc_satisfaction_18_plus,
          q3.ask_people_to_repeat_themselves AS p3_qc_ask_repeat,
          q3.notes_from_shf AS p3_qc_notes,
          es3.ears_clear AS p3_es_ears_clear,
          es3.otc_wax AS p3_es_otc_wax,
          es3.otc_infection AS p3_es_otc_infection,
          es3.otc_perforation AS p3_es_otc_perforation,
          es3.otc_tinnitus AS p3_es_otc_tinnitus,
          es3.otc_atresia AS p3_es_otc_atresia,
          es3.otc_implant AS p3_es_otc_implant,
          es3.otc_other AS p3_es_otc_other,
          es3.medical_recommendation AS p3_es_medical_recommendation,
          es3.medication_given AS p3_es_medication_given,
          es3.left_ear_clear_for_fitting AS p3_es_left_clear_for_fitting,
          es3.right_ear_clear_for_fitting AS p3_es_right_clear_for_fitting,
          es3.comments AS p3_es_comments,
          a3.created_at AS p3_assessment_created_at
        FROM aftercare_assessment a3
        JOIN patients p ON p.patient_id = a3.patient_id
        LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id AND pp.phase_id = 3
        LEFT JOIN phase3_registration_section p3 ON p.patient_id = p3.patient_id
        LEFT JOIN final_qc_p3 q3 ON q3.patient_id = p.patient_id AND q3.phase_id = 3
        LEFT JOIN ear_screening es3 ON es3.patient_id = p.patient_id AND es3.phase_id = 3
      `
      const { whereClauses, params } = ReportingController.buildCommonFilters(
        { city, gender, status, dateStart, dateEnd },
        1,
        'COALESCE(a3.created_at, pp.phase_start_date)',
        { city: 'p3.city', gender: 'p.gender', status: 'pp.status' }
      )
      const final = base + (whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '') + ' ORDER BY a3.created_at DESC'
      const { rows } = await db.query(final, params)
      return ResponseHandler.success(res, rows, 'Phase 3 export generated')
    } catch (e) {
      console.error(e)
      return ResponseHandler.error(res, 'Failed to export Phase 3')
    }
  }

  static async exportAllPhases(req, res) {
    try {
      const { city, gender, status, dateStart, dateEnd, phaseId } = req.query
      const phase1 = `
        SELECT
          1 AS phase_id,
          p.patient_id,
          p.shf_id,
          p.first_name,
          p.last_name,
          p.gender,
          p.date_of_birth,
          pp.status,
          pp.phase_start_date,
          pp.phase_end_date,
          p1.registration_date AS registration_date,
          p1.city AS city,
          'single' AS phase3_visit_type,
          NULL::timestamp AS assessment_created_at
        FROM patients p
        LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id AND pp.phase_id = 1
        LEFT JOIN phase1_registration_section p1 ON p.patient_id = p1.patient_id
      `
      const phase2 = `
        SELECT
          2 AS phase_id,
          p.patient_id,
          p.shf_id,
          p.first_name,
          p.last_name,
          p.gender,
          p.date_of_birth,
          pp.status,
          pp.phase_start_date,
          pp.phase_end_date,
          p2.registration_date AS registration_date,
          p2.city AS city,
          'single' AS phase3_visit_type,
          NULL::timestamp AS assessment_created_at
        FROM patients p
        LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id AND pp.phase_id = 2
        LEFT JOIN phase2_registration_section p2 ON p.patient_id = p2.patient_id
      `
      const phase3 = `
        SELECT
          3 AS phase_id,
          p.patient_id,
          p.shf_id,
          p.first_name,
          p.last_name,
          p.gender,
          p.date_of_birth,
          pp.status,
          pp.phase_start_date,
          pp.phase_end_date,
          p3.registration_date AS registration_date,
          p3.city AS city,
          'aftercare' AS phase3_visit_type,
          a3.created_at AS assessment_created_at
        FROM aftercare_assessment a3
        JOIN patients p ON p.patient_id = a3.patient_id
        LEFT JOIN patient_phases pp ON p.patient_id = pp.patient_id AND pp.phase_id = 3
        LEFT JOIN phase3_registration_section p3 ON p.patient_id = p3.patient_id
      `
      const unioned = `(${phase1}) UNION ALL (${phase2}) UNION ALL (${phase3})`
      const wrapped = `SELECT * FROM (${unioned}) AS u`
      const { whereClauses, params } = ReportingController.buildCommonFilters(
        { city, gender, status, dateStart, dateEnd },
        1,
        'COALESCE(assessment_created_at, registration_date, phase_start_date)',
        { city: 'city', gender: 'gender', status: 'status' }
      )
      if (phaseId && phaseId !== 'all') {
        whereClauses.push(`phase_id = $${params.length + 1}`)
        params.push(Number(phaseId))
      }
      const final =
        wrapped +
        (whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '') +
        ' ORDER BY phase_id, patient_id, assessment_created_at DESC NULLS LAST'
      const { rows } = await db.query(final, params)
      return ResponseHandler.success(res, rows, 'All phases export generated')
    } catch (e) {
      console.error(e)
      return ResponseHandler.error(res, 'Failed to export all phases')
    }
  }
}

module.exports = ReportingController