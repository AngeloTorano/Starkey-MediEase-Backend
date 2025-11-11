const db = require("../config/database");
const ResponseHandler = require("../utils/responseHandler");

// Helper to fetch latest reg id if not supplied
async function resolveLatestRegId(client, table, idColumn, patient_id) {
  const q = `
    SELECT ${idColumn} FROM ${table}
    WHERE patient_id = $1
    ORDER BY registration_date DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1
  `;
  const r = await client.query(q, [patient_id]);
  return r.rows[0]?.[idColumn] || null;
}

class CombinedPhaseController {
  static async getPhase1And2(req, res) {
    const client = await db.getClient();
    try {
      const patientId = Number(req.params.patientId);
      const phase1RegIdRaw = req.query.phase1_reg_id;
      const phase2RegIdRaw = req.query.phase2_reg_id;

      if (!patientId || isNaN(patientId)) {
        return ResponseHandler.error(res, "Invalid patient ID", 400);
      }

      // Resolve (optional) registration ids
      let phase1_reg_id = phase1RegIdRaw ? Number(phase1RegIdRaw) : null;
      let phase2_reg_id = phase2RegIdRaw ? Number(phase2RegIdRaw) : null;

      // If not provided, find latest existing
      if (!phase1_reg_id) {
        phase1_reg_id = await resolveLatestRegId(client, "phase1_registration_section", "phase1_reg_id", patientId);
      }
      if (!phase2_reg_id) {
        phase2_reg_id = await resolveLatestRegId(client, "phase2_registration_section", "phase2_reg_id", patientId);
      }

      // Phase 1 (single‑entry sections)
      const phase1 = {};
      if (phase1_reg_id) {
        const reg = await client.query(
          `
            SELECT
              phase1_reg_id,
              patient_id,
              phase_id,
              to_char(registration_date, 'YYYY-MM-DD') AS registration_date,
              city,
              completed_by_user_id,
              has_hearing_loss,
              uses_sign_language,
              uses_speech,
              hearing_loss_causes,
              ringing_sensation,
              ear_pain,
              hearing_satisfaction_18_plus,
              conversation_difficulty,
              created_at,
              updated_at
            FROM phase1_registration_section
            WHERE patient_id=$1 AND phase1_reg_id=$2
            LIMIT 1
          `,
          [patientId, phase1_reg_id]
        );
        phase1.registration = reg.rows[0] || null;

        const ear = await client.query(
          `SELECT * FROM ear_screening WHERE patient_id=$1 AND phase_id=1 AND phase1_reg_id=$2 ORDER BY created_at DESC`,
          [patientId, phase1_reg_id]
        );
        phase1.earScreening = ear.rows || [];

        const hearing = await client.query(
          `SELECT * FROM hearing_screening WHERE patient_id=$1 AND phase_id=1 AND phase1_reg_id=$2 ORDER BY created_at DESC LIMIT 1`,
          [patientId, phase1_reg_id]
        );
        phase1.hearingScreening = hearing.rows[0] || null;

        const impressions = await client.query(
          `SELECT * FROM ear_impressions WHERE patient_id=$1 AND phase_id=1 AND phase1_reg_id=$2 ORDER BY created_at DESC`,
          [patientId, phase1_reg_id]
        );
        phase1.earImpressions = impressions.rows || [];

        const qc = await client.query(
          `SELECT * FROM final_qc_p1 WHERE patient_id=$1 AND phase_id=1 AND phase1_reg_id=$2 ORDER BY created_at DESC LIMIT 1`,
          [patientId, phase1_reg_id]
        );
        phase1.finalQC = qc.rows[0] || null;
      }

      // Phase 2
      const phase2 = {};
      if (phase2_reg_id) {
        const reg = await client.query(
          `SELECT
             phase2_reg_id,
             patient_id,
             to_char(registration_date,'YYYY-MM-DD') AS registration_date,
             city,
             patient_type,
             created_at,
             updated_at
           FROM phase2_registration_section
           WHERE patient_id=$1 AND phase2_reg_id=$2
           LIMIT 1`,
          [patientId, phase2_reg_id]
        );
        phase2.registration = reg.rows[0] || null;

        // ADD: Phase 2 Ear Screening (includes medication_given text[])
        const ear2 = await client.query(
          `SELECT *
           FROM ear_screening
           WHERE patient_id=$1 AND phase_id=2 AND phase2_reg_id=$2
           ORDER BY created_at DESC`,
          [patientId, phase2_reg_id]
        );
        phase2.earScreening = ear2.rows || [];

        // OPTIONAL: include additional Phase 2 sections if available in your schema
        const hearing2 = await client.query(
          `SELECT * FROM hearing_screening
           WHERE patient_id=$1 AND phase_id=2 AND phase2_reg_id=$2
           ORDER BY created_at DESC LIMIT 1`,
          [patientId, phase2_reg_id]
        );
        phase2.hearingScreening = hearing2.rows[0] || null;

        const fittingTable = await client.query(
          `SELECT * FROM fitting_table
           WHERE patient_id=$1 AND phase2_reg_id=$2
           ORDER BY created_at DESC LIMIT 1`,
          [patientId, phase2_reg_id]
        );
        phase2.fittingTable = fittingTable.rows[0] || null;

        const fitting = await client.query(
          `SELECT * FROM fitting
           WHERE patient_id=$1 AND phase2_reg_id=$2
           ORDER BY created_at DESC LIMIT 1`,
          [patientId, phase2_reg_id]
        );
        phase2.fitting = fitting.rows[0] || null;

        const counseling = await client.query(
          `SELECT * FROM counseling
           WHERE patient_id=$1 AND phase2_reg_id=$2
           ORDER BY created_at DESC LIMIT 1`,
          [patientId, phase2_reg_id]
        );
        phase2.counseling = counseling.rows[0] || null;

        const qc2 = await client.query(
          `SELECT * FROM final_qc_p2
           WHERE patient_id=$1 AND phase2_reg_id=$2
           ORDER BY created_at DESC LIMIT 1`,
          [patientId, phase2_reg_id]
        );
        phase2.finalQC = qc2.rows[0] || null;
      }

      // Lock flags: a section is locked if data object/array exists & not empty
      const locks = {
        phase1: {
          registration: !!phase1.registration,
          earScreening: (phase1.earScreening || []).length > 0,
          hearingScreening: !!phase1.hearingScreening,
          earImpressions: (phase1.earImpressions || []).length > 0,
          finalQC: !!phase1.finalQC
        },
        phase2: {
          registration: !!phase2.registration,
          earScreening: (phase2.earScreening || []).length > 0,
          hearingScreening: !!phase2.hearingScreening,
          fittingTable: !!phase2.fittingTable,
          fitting: !!phase2.fitting,
          counseling: !!phase2.counseling,
          finalQC: !!phase2.finalQC
        }
      };

      return ResponseHandler.success(res, {
        patient_id: patientId,
        phase1_reg_id,
        phase2_reg_id,
        phase1,
        phase2,
        locks
      }, "Phase 1 & 2 data retrieved");
    } catch (e) {
      console.error("Combined phase fetch error:", e);
      return ResponseHandler.error(res, "Failed to retrieve phase data");
    } finally {
      client.release();
    }
  }
}

module.exports = CombinedPhaseController;