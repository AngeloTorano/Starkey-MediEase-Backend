/* eslint-disable @typescript-eslint/no-var-requires */
const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")
const InventoryService = require("../utils/inventoryService") // <-- Import the new service

class SupplyController {
  
  // --- createSupply remains the same as your original ---
  static async createSupply(req, res) {
    const client = await db.getClient()
    try {
      await client.query("BEGIN")

      const supplyData = req.body
      
      // 👇 --- ADDED: Make sure item_code is included if provided --- 👇
      if (!supplyData.item_code) {
          supplyData.item_code = null; // Or generate one
      }
      // 👆 --- END OF ADDITION --- 👆

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

      // Log supply creation (if audit_logs exists)
      const auditTableCheck = await client.query("SELECT to_regclass('public.audit_logs') as exists;");
      if (auditTableCheck.rows[0].exists) {
        await client.query(
          "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
          ["supplies", supply.supply_id, "CREATE", JSON.stringify(supplyData), req.user.user_id],
        )
      }

      await client.query("COMMIT")
      return ResponseHandler.success(res, supply, "Supply created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create supply error:", error)
      if (error.code === '23505' && error.constraint === 'supplies_item_code_key') {
           return ResponseHandler.error(res, "Item Code must be unique.", 400);
      }
      return ResponseHandler.error(res, "Failed to create supply")
    } finally {
      client.release()
    }
  }

  // --- getSupplies remains the same as your original ---
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

      query += ` ORDER BY s.item_name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      params.push(limit, offset)

      const result = await db.query(query, params)
      
      // Also get total count for pagination
      let countQuery = `SELECT COUNT(*) FROM supplies s`
      if (conditions.length > 0) {
         countQuery += ` LEFT JOIN supply_categories sc ON s.category_id = sc.category_id WHERE ${conditions.join(" AND ")}`
      }
      const totalResult = await db.query(countQuery, params.slice(0, params.length - 2)); // remove limit/offset params
      const totalCount = totalResult.rows[0].count;

      return ResponseHandler.success(res, {
        supplies: result.rows,
        totalCount: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: Number(page)
      }, "Supplies retrieved successfully")

    } catch (error) {
      console.error("Get supplies error:", error)
      return ResponseHandler.error(res, "Failed to retrieve supplies")
    }
  }


  // --- 👇 THIS METHOD IS NOW UPDATED 👇 ---
  static async updateStock(req, res) {
    const client = await db.getClient()
    try {
      await client.query("BEGIN")

      const { supplyId } = req.params
      const { quantity, transaction_type, notes } = req.body
      const userId = req.user.user_id

      if (!quantity || !transaction_type) {
         return ResponseHandler.error(res, "Missing quantity or transaction_type", 400)
      }

      // 1. Get the item_code from the supply_id
      const supply = await client.query("SELECT item_code FROM supplies WHERE supply_id = $1", [supplyId])
      if (supply.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Supply not found")
      }
      const itemCode = supply.rows[0].item_code

      if (!itemCode) {
         await client.query("ROLLBACK")
         return ResponseHandler.error(res, "Cannot update stock for item without an Item Code.", 400)
      }

      // 2. Use the new service to perform the update
      const result = await InventoryService.updateStockByCode(
        client,
        itemCode,
        Number(quantity),
        transaction_type, // e.g., "Received" from your React restock
        userId,
        notes,
      )

      await client.query("COMMIT")
      return ResponseHandler.success(res, { new_stock_level: result.new_stock_level }, "Stock updated successfully")

    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update stock error:", error)
      // Pass service errors (like "Insufficient stock") to the client
      if (error.message.includes("Insufficient stock") || error.message.includes("not found")) {
        return ResponseHandler.error(res, error.message, 400)
      }
      return ResponseHandler.error(res, "Failed to update stock")
    } finally {
      client.release()
    }
  }
  // --- 👆 END OF UPDATED METHOD 👆 ---


  // --- getSupplyTransactions remains the same as your original ---
  static async getSupplyTransactions(req, res) {
    try {
      const { supplyId } = req.params
      const { page = 1, limit = 50 } = req.query // Increased default limit
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

      const totalResult = await db.query("SELECT COUNT(*) FROM supply_transactions WHERE supply_id = $1", [supplyId]);
      const totalCount = totalResult.rows[0].count;

      return ResponseHandler.success(res, {
        transactions: result.rows,
        totalCount: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: Number(page)
      }, "Supply transactions retrieved successfully")
    } catch (error) {
      console.error("Get supply transactions error:", error)
      return ResponseHandler.error(res, "Failed to retrieve supply transactions")
    }
  }

  // --- All other methods (getSupplyCategories, createSupplyCategory, etc.) remain the same ---
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

      // Log category creation (if audit_logs exists)
      const auditTableCheck = await client.query("SELECT to_regclass('public.audit_logs') as exists;");
      if (auditTableCheck.rows[0].exists) {
        await client.query(
          "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
          ["supply_categories", result.rows[0].category_id, "CREATE", JSON.stringify(result.rows[0]), req.user.user_id],
        )
      }
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

      // Log supply update (if audit_logs exists)
      const auditTableCheck = await client.query("SELECT to_regclass('public.audit_logs') as exists;");
      if (auditTableCheck.rows[0].exists) {
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
      }
      await client.query("COMMIT")
      return ResponseHandler.success(res, updatedSupply, "Supply updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update supply error:", error)
      if (error.code === '23505' && error.constraint === 'supplies_item_code_key') {
           return ResponseHandler.error(res, "Item Code must be unique.", 400);
      }
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

      const supplyResult = await client.query("SELECT * FROM supplies WHERE supply_id = $1", [supplyId])
      if (supplyResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Supply not found")
      }
      const supply = supplyResult.rows[0]

      const transactionCheck = await client.query(
        "SELECT COUNT(*) as count FROM supply_transactions WHERE supply_id = $1",
        [supplyId],
      )

      if (transactionCheck.rows[0].count > 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Cannot delete supply with existing transactions. Mark as 'Inactive' instead.", 400)
      }

      await client.query("DELETE FROM supplies WHERE supply_id = $1", [supplyId])

      // Log supply deletion (if audit_logs exists)
      const auditTableCheck = await client.query("SELECT to_regclass('public.audit_logs') as exists;");
      if (auditTableCheck.rows[0].exists) {
        await client.query(
          "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
          ["supplies", supplyId, "DELETE", JSON.stringify(supply), req.user.user_id],
        )
      }
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