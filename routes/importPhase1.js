const express = require('express')
const { authenticateToken } = require('../middleware/auth')
const multer = require('multer')
const { parse } = require('csv-parse/sync')
const db = require('../config/database')
const ResponseHandler = require('../utils/responseHandler')

const upload = multer({ storage: multer.memoryStorage() })
const router = express.Router()
router.use(authenticateToken)

router.post('/import/phase1', upload.single('file'), async (req, res) => {
  if (!req.file) return ResponseHandler.error(res, 'File missing')
  try {
    const records = parse(req.file.buffer, {
      columns: true,
      trim: true,
      skip_empty_lines: true,
    })

    const client = await db.getClient()
    try {
      await client.query('BEGIN')
      for (const r of records) {
        const phase1RegId = r.phase1_reg_id
        if (phase1RegId) {
          // Update existing registration
            await client.query(
              `UPDATE phase1_registration_section
               SET city = $1, registration_date = COALESCE($2, registration_date), updated_at = now()
               WHERE phase1_reg_id = $3`,
              [r.p1_city || null, r.p1_registration_date || null, phase1RegId]
            )
        } else {
          // Insert new patient + registration
          const { rows: pRows } = await client.query(
            `INSERT INTO patients(first_name,last_name,gender,date_of_birth,created_at)
             VALUES($1,$2,$3,$4,now()) RETURNING patient_id`,
            [r.first_name, r.last_name, r.gender || null, r.date_of_birth || null]
          )
          const pid = pRows[0].patient_id
          await client.query(
            `INSERT INTO phase1_registration_section(patient_id, registration_date, city, phase_id, created_at)
             VALUES($1,$2,$3,1,now())`,
            [pid, r.p1_registration_date || new Date(), r.p1_city || null]
          )
        }
      }
      await client.query('COMMIT')
      return ResponseHandler.success(res, { imported: records.length }, 'Phase 1 import done')
    } catch (e) {
      await client.query('ROLLBACK')
      console.error(e)
      return ResponseHandler.error(res, 'Import failed')
    } finally {
      client.release()
    }
  } catch (e) {
    console.error(e)
    return ResponseHandler.error(res, 'Parse failed')
  }
})

module.exports = router