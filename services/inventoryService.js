/* eslint-disable @typescript-eslint/no-var-requires */
const db = require("../config/database") // Make sure this path is correct

/**
 * Service to manage inventory stock levels and log transactions.
 * This can be called from any controller (SupplyController, PatientController, etc.)
 */
class InventoryService {
  /**
   * Updates the stock level for an item identified by its unique item_code.
   * This function MUST be called within an existing database transaction (using the provided client).
   *
   * @param {object} client - The PostgreSQL client from an active transaction (e.g., from db.getClient()).
   * @param {string} itemCode - The unique item_code (e.g., 'BATT_13').
   * @param {number} quantityChange - The amount to change by (e.g., -2 for using, 10 for restocking).
   * @param {string} transactionTypeName - The name of the transaction type (e.g., 'Used', 'Received').
   * @param {number} userId - The ID of the user performing the action.
   * @param {string} [notes] - Optional notes for the transaction log.
   * @param {object} [meta] - Optional metadata for the transaction (e.g., { patient_id, phase_id, related_event_type }).
   */
  static async updateStockByCode(client, itemCode, quantityChange, transactionTypeName, userId, notes, meta = {}) {
    if (!itemCode || quantityChange === undefined || !transactionTypeName || !userId) {
      throw new Error("Missing required parameters for updateStockByCode")
    }
    
    // 0 quantity change does nothing
    if (quantityChange === 0) {
      return { new_stock_level: null, message: "No quantity change." }
    }

    // 1. Get the supply and its current stock
    const supplyResult = await client.query(
      "SELECT supply_id, current_stock_level, item_name FROM supplies WHERE item_code = $1 FOR UPDATE",
      [itemCode],
    )

    if (supplyResult.rows.length === 0) {
      throw new Error(`Inventory item with code ${itemCode} not found.`)
    }
    const supply = supplyResult.rows[0]
    const currentStock = supply.current_stock_level
    const newStockLevel = currentStock + quantityChange

    // 2. Check for sufficient stock if quantity is negative
    if (newStockLevel < 0) {
      throw new Error(`Insufficient stock for ${supply.item_name}. Requested: ${Math.abs(quantityChange)}, Available: ${currentStock}`)
    }

    // 3. Get the transaction type ID
    const typeResult = await client.query(
      "SELECT transaction_type_id FROM supply_transaction_types WHERE LOWER(type_name) = LOWER($1) LIMIT 1",
      [transactionTypeName],
    )

    if (typeResult.rows.length === 0) {
      throw new Error(`Invalid transaction type: ${transactionTypeName}`)
    }
    const transactionTypeId = typeResult.rows[0].transaction_type_id

    // 4. Update the stock level in the supplies table
    await client.query(
      "UPDATE supplies SET current_stock_level = $1, updated_at = CURRENT_TIMESTAMP WHERE supply_id = $2",
      [newStockLevel, supply.supply_id],
    )

    // Extract optional meta
    const { patient_id = null, phase_id = null, related_event_type = null } = meta || {}

    // 5. Record the transaction with patient linkage and explicit transaction_date
    await client.query(
      "INSERT INTO supply_transactions (supply_id, transaction_type_id, quantity, transaction_date, recorded_by_user_id, notes, patient_id, phase_id, related_event_type) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6, $7, $8)",
      [supply.supply_id, transactionTypeId, quantityChange, userId, notes || null, patient_id, phase_id, related_event_type],
    )

    // 6. Log the audit trail (if you have an audit_logs table)
    // Check if audit_logs table exists before trying to insert
    const auditTableCheck = await client.query(
      "SELECT to_regclass('public.audit_logs') as exists;"
    );
    
    if (auditTableCheck.rows[0].exists) {
        await client.query(
          "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
          [
            "supplies",
            supply.supply_id,
            "STOCK_UPDATE",
            JSON.stringify({ old_stock: currentStock }),
            JSON.stringify({ new_stock: newStockLevel, quantityChange, transaction_type: transactionTypeName, patient_id, phase_id, related_event_type }),
            userId,
          ],
        )
    }

    return { new_stock_level: newStockLevel }
  }

  /**
   * Updates the stock level for a supply item identified by its unique supply_id.
   * This function MUST be called within an existing database transaction (using the provided client).
   *
   * @param {object} client - The PostgreSQL client from an active transaction (e.g., from db.getClient()).
   * @param {number} supplyId - The unique ID of the supply item (e.g., 123).
   * @param {number} deltaQty - The quantity to change by (can be positive or negative).
   * @param {string} transactionType - The name of the transaction type (e.g., 'Adjustment', 'Return').
   * @param {number} userId - The ID of the user performing the action.
   * @param {string} [notes] - Optional notes for the transaction log.
   * @param {object} [meta] - Optional metadata for the transaction (e.g., patient_id, phase_id).
   */
  static async updateStockById(client, supplyId, deltaQty, transactionType, userId, notes, meta = {}) {
    const sRes = await client.query(
      "SELECT current_stock_level FROM supplies WHERE supply_id = $1 FOR UPDATE",
      [supplyId]
    )
    if (!sRes.rows.length) throw new Error("Supply not found")

    const current = Number(sRes.rows[0].current_stock_level || 0)
    const delta = Number(deltaQty)
    if (Number.isNaN(delta)) throw new Error("Invalid quantity")
    const newLevel = current + delta
    if (newLevel < 0) throw new Error("Insufficient stock")

    await client.query(
      "UPDATE supplies SET current_stock_level = $1, updated_at = CURRENT_TIMESTAMP WHERE supply_id = $2",
      [newLevel, supplyId]
    )

    const tRes = await client.query(
      "SELECT transaction_type_id FROM supply_transaction_types WHERE LOWER(type_name)=LOWER($1) LIMIT 1",
      [transactionType]
    )
    const transaction_type_id = tRes.rows[0]?.transaction_type_id || null

    // Insert transaction with optional tracking
    await client.query(
      "INSERT INTO supply_transactions (supply_id, transaction_type_id, quantity, transaction_date, recorded_by_user_id, notes, patient_id, phase_id, related_event_type) VALUES ($1,$2,$3, CURRENT_TIMESTAMP, $4,$5,$6,$7,$8)",
      [
        supplyId,
        transaction_type_id,
        delta,
        userId || null,
        notes || null,
        meta.patient_id || null,
        meta.phase_id || null,
        meta.related_event_type || null,
      ]
    )

    return { new_stock_level: newLevel }
  }

}

module.exports = InventoryService