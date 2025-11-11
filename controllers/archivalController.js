"use strict";

const db = require("../config/database");
const ResponseHandler = require("../utils/responseHandler");

class ArchivalController {
  // Manual archive (single patient trigger)
  static async manualArchivePatient(req, res) {
    const client = await db.getClient();
    try {
      const { patientId } = req.params;
      const pid = Number(patientId);
      if (!pid || isNaN(pid)) return ResponseHandler.error(res, "Invalid patient id", 400);

      const pRes = await client.query("SELECT * FROM patients WHERE patient_id = $1", [pid]);
      if (pRes.rows.length === 0) return ResponseHandler.notFound(res, "Patient not found");
      const patient = pRes.rows[0];
      if (patient.archived) return ResponseHandler.error(res, "Patient already archived", 400);

      await client.query("BEGIN");

      const fetchLatest = async (table, phaseId = null, single = true) => {
        let sql = `SELECT * FROM ${table} WHERE patient_id = $1`;
        const params = [pid];
        if (phaseId !== null) { sql += " AND phase_id = $2"; params.push(phaseId); }
        sql += " ORDER BY created_at DESC";
        if (single) sql += " LIMIT 1";
        const r = await client.query(sql, params);
        return single ? (r.rows[0] || null) : r.rows;
      };

      const snapshot = {
        patient,
        phase1: {
          registration: await fetchLatest("phase1_registration_section", 1, true),
          ear_screenings: await fetchLatest("ear_screening", 1, false),
          hearing_screening: await fetchLatest("hearing_screening", 1, true),
        },
        phase2: {
          registration: await fetchLatest("phase2_registration_section", 2, true),
          ear_screenings: await fetchLatest("ear_screening", 2, false),
          fitting_table: await fetchLatest("fitting_table", 2, true),
        },
        phase3: {
          registration: await fetchLatest("phase3_registration_section", 3, true),
          aftercare_assessments: await fetchLatest("aftercare_assessment", 3, false),
        },
      };

      const summary = {
        patient_id: pid,
        shf_id: patient.shf_id || null,
        name: `${patient.first_name || ""} ${patient.last_name || ""}`.trim(),
        archived_at: new Date().toISOString(),
        reason: "Manual",
      };

      const ins = await client.query(
        `INSERT INTO patient_archives (patient_id, archived_by_user_id, snapshot, summary)
         VALUES ($1,$2,$3,$4) RETURNING archive_id, archived_at`,
        [pid, req.user?.user_id || null, JSON.stringify(snapshot), JSON.stringify(summary)],
      );

      await client.query("UPDATE patients SET archived = TRUE WHERE patient_id = $1", [pid]);
      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id)
         VALUES ($1,$2,$3,$4,$5)`,
        ["patient_archives", ins.rows[0].archive_id, "MANUAL_ARCHIVE", JSON.stringify(summary), req.user?.user_id || null],
      );

      await client.query("COMMIT");
      return ResponseHandler.success(res, ins.rows[0], "Patient archived");
    } catch (err) {
      await client.query("ROLLBACK").catch(()=>{});
      console.error("manualArchivePatient error:", err);
      return ResponseHandler.error(res, "Failed to archive patient: " + (err?.message || err));
    } finally {
      client.release();
    }
  }

  // Unarchive a patient (reverse archived flag). Keeps archive records intact.
  static async unarchivePatient(req, res) {
    const client = await db.getClient();
    try {
      const { patientId } = req.params;
      const pid = Number(patientId);
      if (!pid || isNaN(pid)) {
        return ResponseHandler.error(res, "Invalid patient id", 400);
      }

      const pRes = await client.query("SELECT * FROM patients WHERE patient_id = $1", [pid]);
      if (pRes.rows.length === 0) return ResponseHandler.notFound(res, "Patient not found");
      const patient = pRes.rows[0];

      if (!patient.archived) {
        return ResponseHandler.error(res, "Patient is not archived", 400);
      }

      await client.query("BEGIN");
      await client.query("UPDATE patients SET archived = FALSE WHERE patient_id = $1", [pid]);
      await client.query(
        `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id)
         VALUES ($1,$2,$3,$4,$5)`,
        ["patients", pid, "UNARCHIVE", JSON.stringify({ patient_id: pid }), req.user?.user_id || null]
      );
      await client.query("COMMIT");

      return ResponseHandler.success(res, { patient_id: pid }, "Patient unarchived", 200);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("unarchivePatient error:", err);
      return ResponseHandler.error(res, "Failed to unarchive patient: " + (err?.message || err));
    } finally {
      client.release();
    }
  }

  // Archive eligible patients in batch (status='deceased' OR date_of_death IS NOT NULL OR last_active_date older than 10 years)
  static async archiveEligiblePatients(req, res) {
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      // find patients not already archived that meet criteria
      const cutoff = `NOW() - INTERVAL '10 years'`;
      const q = `
        SELECT patient_id FROM patients
        WHERE archived = FALSE
        AND (
          LOWER(status) = 'deceased'
          OR date_of_death IS NOT NULL
          OR (last_active_date IS NOT NULL AND last_active_date < ${cutoff})
        )
      `;
      const r = await client.query(q);
      const ids = r.rows.map((r) => r.patient_id);
      for (const pid of ids) {
        // call internal archive routine (reuse existing logic by invoking archivePatient core)
        try {
          // create a fake req-like context for user performing the batch (if req.user present use it)
          const fakeReq = { params: { patientId: pid }, query: {}, user: req?.user || { user_id: null } };
          // call existing method (note: archivePatient uses DB client per call, but we are inside transaction; call logic inline)
          // For simplicity reuse existing archive logic by copying snapshot insertion here to avoid nested transactions
          const pRes = await client.query("SELECT * FROM patients WHERE patient_id = $1", [pid]);
          const patient = pRes.rows[0];
          const fetchLatest = async (table, phaseId = null, single = true) => {
            let sql = `SELECT * FROM ${table} WHERE patient_id = $1`;
            const params = [pid];
            if (phaseId !== null) {
              sql += ` AND phase_id = $2`;
              params.push(phaseId);
            }
            sql += " ORDER BY created_at DESC";
            if (single) sql += " LIMIT 1";
            const rr = await client.query(sql, params);
            return single ? (rr.rows[0] || null) : rr.rows;
          };
          const snapshot = {
            patient,
            phase1: {
              registration: await fetchLatest("phase1_registration_section", 1, true),
              ear_screenings: await fetchLatest("ear_screening", 1, false),
              hearing_screening: await fetchLatest("hearing_screening", 1, true),
            },
            phase2: {
              registration: await fetchLatest("phase2_registration_section", 2, true),
              ear_screenings: await fetchLatest("ear_screening", 2, false),
              fitting_table: await fetchLatest("fitting_table", 2, true),
            },
            phase3: {
              registration: await fetchLatest("phase3_registration_section", 3, true),
              aftercare_assessments: await fetchLatest("aftercare_assessment", 3, false),
            },
          };
          const summary = {
            patient_id: pid,
            shf_id: patient.shf_id || null,
            name: `${patient.first_name || ""} ${patient.last_name || ""}`.trim(),
            archived_at: new Date().toISOString(),
            reason: patient.status || (patient.date_of_death ? "Deceased" : "Inactive >10y"),
          };
          const insertSql = `
            INSERT INTO patient_archives (patient_id, archived_by_user_id, snapshot, summary)
            VALUES ($1, $2, $3, $4)
            RETURNING archive_id, archived_at
          `;
          const insertRes = await client.query(insertSql, [
            pid,
            req.user?.user_id || null,
            JSON.stringify(snapshot),
            JSON.stringify(summary),
          ]);
          await client.query("UPDATE patients SET archived = TRUE WHERE patient_id = $1", [pid]);
          await client.query(
            `INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id)
             VALUES ($1,$2,$3,$4,$5)`,
            ["patient_archives", insertRes.rows[0].archive_id, "AUTO_ARCHIVE", JSON.stringify(summary), req.user?.user_id || null]
          );
        } catch (innerErr) {
          console.error(`Failed auto-archive patient ${pid}:`, innerErr);
          // continue with other patients
        }
      }
      await client.query("COMMIT");
      if (res) return ResponseHandler.success(res, { archived_count: ids.length }, "Auto-archive completed", 200);
      return { archived_count: ids.length };
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("archiveEligiblePatients error:", err);
      if (res) return ResponseHandler.error(res, "Auto-archive failed: " + (err?.message || err));
      throw err;
    } finally {
      client.release();
    }
  }

  // simple GET to list archives for a patient
  static async getArchives(req, res) {
    try {
      const { patientId } = req.params;
      const pid = Number(patientId);
      if (!pid || isNaN(pid)) return ResponseHandler.error(res, "Invalid patient id", 400);

      const result = await db.query("SELECT archive_id, patient_id, archived_by_user_id, archived_at, summary FROM patient_archives WHERE patient_id = $1 ORDER BY archived_at DESC", [pid]);
      return ResponseHandler.success(res, result.rows, "Archives retrieved");
    } catch (err) {
      console.error("getArchives error:", err);
      return ResponseHandler.error(res, "Failed to get archives");
    }
  }

  // List archived patients (summary - one row per patient, latest archive)
  static async getArchivedPatients(req, res) {
    try {
      const q = `
        SELECT DISTINCT ON (pa.patient_id)
          pa.archive_id, pa.patient_id, (pa.summary->>'shf_id') AS shf_id,
          (pa.summary->>'name') AS name, pa.archived_at, pa.summary
        FROM patient_archives pa
        ORDER BY pa.patient_id, pa.archived_at DESC
      `;
      const r = await db.query(q);
      return ResponseHandler.success(res, r.rows, "Archived patients retrieved");
    } catch (err) {
      console.error("getArchivedPatients error:", err);
      return ResponseHandler.error(res, "Failed to retrieve archived patients");
    }
  }
}

module.exports = ArchivalController;