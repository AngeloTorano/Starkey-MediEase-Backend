const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

class SupplyController {
  static async createSupply(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const supplyData = req.body

      const columns = Object.keys(supplyData).join(", ")
      const placeholders = Object.keys(supplyData)
        .map((_, index) => `$${index + 1}`)
        .join(", ")
      const values = Object.values(supplyData)

      const query = `
        INSERT INTO supplies (${columns})
        VALUES (${placeholders})
        RETURNING *
      `

      const result = await client.query(query, values)
      const supply = result.rows[0]

      // Log supply creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["supplies", supply.supply_id, "CREATE", JSON.stringify(supplyData), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, supply, "Supply created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create supply error:", error)
      return ResponseHandler.error(res, "Failed to create supply")
    } finally {
      client.release()
    }
  }

  static async getSupplies(req, res) {
    try {
      const { page = 1, limit = 10, category, status, low_stock } = req.query
      const offset = (page - 1) * limit

      let query = `
        SELECT s.*, sc.category_name
        FROM supplies s
        LEFT JOIN supply_categories sc ON s.category_id = sc.category_id
      `

      const conditions = []
      const params = []

      if (category) {
        conditions.push(`sc.category_name = $${params.length + 1}`)
        params.push(category)
      }

      if (status) {
        conditions.push(`s.status = $${params.length + 1}`)
        params.push(status)
      }

      if (low_stock === "true") {
        conditions.push(`s.current_stock_level <= s.reorder_level`)
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`
      }

      query += ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await db.query(query, params)

      return ResponseHandler.success(res, result.rows, "Supplies retrieved successfully")
    } catch (error) {
      console.error("Get supplies error:", error)
      return ResponseHandler.error(res, "Failed to retrieve supplies")
    }
  }

  static async updateStock(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { supplyId } = req.params
      const { quantity, transaction_type, notes } = req.body

      // Get current supply data
      const supplyResult = await client.query("SELECT * FROM supplies WHERE supply_id = $1", [supplyId])

      if (supplyResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Supply not found")
      }

      const supply = supplyResult.rows[0]
      const newStockLevel = supply.current_stock_level + quantity

      if (newStockLevel < 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Insufficient stock", 400)
      }

      // Update stock level
      await client.query(
        "UPDATE supplies SET current_stock_level = $1, updated_at = CURRENT_TIMESTAMP WHERE supply_id = $2",
        [newStockLevel, supplyId],
      )

      // Get transaction type ID
      const transactionTypeResult = await client.query(
        "SELECT transaction_type_id FROM supply_transaction_types WHERE type_name = $1",
        [transaction_type],
      )

      if (transactionTypeResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Invalid transaction type", 400)
      }

      // Record transaction
      await client.query(
        "INSERT INTO supply_transactions (supply_id, transaction_type_id, quantity, recorded_by_user_id, notes) VALUES ($1, $2, $3, $4, $5)",
        [supplyId, transactionTypeResult.rows[0].transaction_type_id, quantity, req.user.user_id, notes],
      )

      // Log stock update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "supplies",
          supplyId,
          "STOCK_UPDATE",
          JSON.stringify({ old_stock: supply.current_stock_level }),
          JSON.stringify({ new_stock: newStockLevel, quantity, transaction_type }),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, { new_stock_level: newStockLevel }, "Stock updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update stock error:", error)
      return ResponseHandler.error(res, "Failed to update stock")
    } finally {
      client.release()
    }
  }

  static async getSupplyTransactions(req, res) {
    try {
      const { supplyId } = req.params
      const { page = 1, limit = 10 } = req.query
      const offset = (page - 1) * limit

      const query = `
        SELECT st.*, stt.type_name, u.username, s.item_name
        FROM supply_transactions st
        LEFT JOIN supply_transaction_types stt ON st.transaction_type_id = stt.transaction_type_id
        LEFT JOIN users u ON st.recorded_by_user_id = u.user_id
        LEFT JOIN supplies s ON st.supply_id = s.supply_id
        WHERE st.supply_id = $1
        ORDER BY st.transaction_date DESC
        LIMIT $2 OFFSET $3
      `

      const result = await db.query(query, [supplyId, limit, offset])

      return ResponseHandler.success(res, result.rows, "Supply transactions retrieved successfully")
    } catch (error) {
      console.error("Get supply transactions error:", error)
      return ResponseHandler.error(res, "Failed to retrieve supply transactions")
    }
  }

  static async getSupplyCategories(req, res) {
    try {
      const query = "SELECT * FROM supply_categories ORDER BY category_name"
      const result = await db.query(query)
      return ResponseHandler.success(res, result.rows, "Supply categories retrieved successfully")
    } catch (error) {
      console.error("Get supply categories error:", error)
      return ResponseHandler.error(res, "Failed to retrieve supply categories")
    }
  }

  static async createSupplyCategory(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { category_name } = req.body

      const query = `
        INSERT INTO supply_categories (category_name)
        VALUES ($1)
        RETURNING *
      `

      const result = await client.query(query, [category_name])

      // Log category creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["supply_categories", result.rows[0].category_id, "CREATE", JSON.stringify(result.rows[0]), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "Supply category created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create supply category error:", error)
      return ResponseHandler.error(res, "Failed to create supply category")
    } finally {
      client.release()
    }
  }

  static async getTransactionTypes(req, res) {
    try {
      const query = "SELECT * FROM supply_transaction_types ORDER BY type_name"
      const result = await db.query(query)
      return ResponseHandler.success(res, result.rows, "Transaction types retrieved successfully")
    } catch (error) {
      console.error("Get transaction types error:", error)
      return ResponseHandler.error(res, "Failed to retrieve transaction types")
    }
  }

  static async getSupplyById(req, res) {
    try {
      const { supplyId } = req.params

      const query = `
        SELECT s.*, sc.category_name
        FROM supplies s
        LEFT JOIN supply_categories sc ON s.category_id = sc.category_id
        WHERE s.supply_id = $1
      `

      const result = await db.query(query, [supplyId])

      if (result.rows.length === 0) {
        return ResponseHandler.notFound(res, "Supply not found")
      }

      return ResponseHandler.success(res, result.rows[0], "Supply retrieved successfully")
    } catch (error) {
      console.error("Get supply by ID error:", error)
      return ResponseHandler.error(res, "Failed to retrieve supply")
    }
  }

  static async updateSupply(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { supplyId } = req.params
      const supplyData = req.body

      // Get current supply data for audit log
      const currentSupplyResult = await client.query("SELECT * FROM supplies WHERE supply_id = $1", [supplyId])

      if (currentSupplyResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Supply not found")
      }

      const currentSupply = currentSupplyResult.rows[0]

      // Build update query dynamically
      const columns = Object.keys(supplyData)
      if (columns.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "No data provided for update", 400)
      }

      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(", ")
      const values = Object.values(supplyData)
      values.push(supplyId) // Add supplyId for WHERE clause

      const query = `
        UPDATE supplies 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE supply_id = $${values.length}
        RETURNING *
      `

      const result = await client.query(query, values)
      const updatedSupply = result.rows[0]

      // Log supply update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "supplies",
          supplyId,
          "UPDATE",
          JSON.stringify(currentSupply),
          JSON.stringify(updatedSupply),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedSupply, "Supply updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update supply error:", error)
      return ResponseHandler.error(res, "Failed to update supply")
    } finally {
      client.release()
    }
  }

  static async deleteSupply(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { supplyId } = req.params

      // Get current supply data for audit log
      const supplyResult = await client.query("SELECT * FROM supplies WHERE supply_id = $1", [supplyId])

      if (supplyResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Supply not found")
      }

      const supply = supplyResult.rows[0]

      // Check if supply has transactions
      const transactionCheck = await client.query(
        "SELECT COUNT(*) as count FROM supply_transactions WHERE supply_id = $1",
        [supplyId],
      )

      if (transactionCheck.rows[0].count > 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Cannot delete supply with existing transactions", 400)
      }

      // Delete supply
      await client.query("DELETE FROM supplies WHERE supply_id = $1", [supplyId])

      // Log supply deletion
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["supplies", supplyId, "DELETE", JSON.stringify(supply), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, null, "Supply deleted successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Delete supply error:", error)
      return ResponseHandler.error(res, "Failed to delete supply")
    } finally {
      client.release()
    }
  }
}

module.exports = SupplyController
