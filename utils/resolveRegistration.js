async function resolvePhaseRegistrationId(client, phase, patientId, providedId) {
  const numeric = Number(providedId);
  if (numeric && !Number.isNaN(numeric)) return numeric;

  let table;
  if (phase === 1) table = "phase1_registration_section";
  else if (phase === 2) table = "phase2_registration_section";
  else if (phase === 3) table = "phase3_registration_section";
  else return null;

  const idColumn = `phase${phase}_reg_id`;

  const q = `
    SELECT ${idColumn} AS reg_id
    FROM ${table}
    WHERE patient_id = $1
    ORDER BY registration_date DESC, created_at DESC
    LIMIT 1
  `;
  const r = await client.query(q, [Number(patientId)]);
  return r.rows[0]?.reg_id || null;
}

module.exports = { resolvePhaseRegistrationId };