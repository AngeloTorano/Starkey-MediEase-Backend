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
   */
  static async updateStockByCode(client, itemCode, quantityChange, transactionTypeName, userId, notes) {
    if (!itemCode || quantityChange === undefined || !transactionTypeName || !userId) {
      throw new Error("Missing required parameters for updateStockByCode")
    }
    
    // 0 quantity change does nothing
    if (quantityChange === 0) {
      return { new_stock_level: null, message: "No quantity change." }
    }

    // 1. Get the supply and its current stock
    const supplyResult = await client.query(
      "SELECT supply_id, current_stock_level, item_name FROM supplies WHERE item_code = $1 FOR UPDATE", // Lock the row
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
      "SELECT transaction_type_id FROM supply_transaction_types WHERE type_name = $1",
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

    // 5. Record the transaction
    await client.query(
      "INSERT INTO supply_transactions (supply_id, transaction_type_id, quantity, recorded_by_user_id, notes) VALUES ($1, $2, $3, $4, $5)",
      [supply.supply_id, transactionTypeId, quantityChange, userId, notes],
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
            JSON.stringify({ new_stock: newStockLevel, quantityChange, transaction_type: transactionTypeName }),
            userId,
          ],
        )
    }

    return { new_stock_level: newStockLevel }
  }
}

module.exports = InventoryService