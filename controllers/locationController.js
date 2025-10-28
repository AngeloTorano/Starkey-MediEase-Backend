const db = require("../config/database")
const ResponseHandler = require("../utils/responseHandler")

class LocationController {
  // Countries
  static async getCountries(req, res) {
    try {
      const result = await db.query("SELECT * FROM countries ORDER BY country_name")
      return ResponseHandler.success(res, result.rows, "Countries retrieved successfully")
    } catch (error) {
      console.error("Get countries error:", error)
      return ResponseHandler.error(res, "Failed to retrieve countries")
    }
  }

  static async createCountry(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { iso_code, country_name } = req.body

      const query = `
        INSERT INTO countries (iso_code, country_name)
        VALUES ($1, $2)
        RETURNING *
      `

      const result = await client.query(query, [iso_code, country_name])

      // Log creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["countries", result.rows[0].country_id, "CREATE", JSON.stringify({ iso_code, country_name }), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "Country created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create country error:", error)
      return ResponseHandler.error(res, "Failed to create country")
    } finally {
      client.release()
    }
  }

  // Cities
  static async getCities(req, res) {
    try {
      const { country_id } = req.query

      let query = `
        SELECT c.*, co.country_name, co.iso_code
        FROM cities c
        LEFT JOIN countries co ON c.country_id = co.country_id
      `

      const params = []

      if (country_id) {
        query += ` WHERE c.country_id = $1`
        params.push(country_id)
      }

      query += ` ORDER BY c.city_name`

      const result = await db.query(query, params)
      return ResponseHandler.success(res, result.rows, "Cities retrieved successfully")
    } catch (error) {
      console.error("Get cities error:", error)
      return ResponseHandler.error(res, "Failed to retrieve cities")
    }
  }

  static async createCity(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { city_name, country_id } = req.body

      const query = `
        INSERT INTO cities (city_name, country_id)
        VALUES ($1, $2)
        RETURNING *
      `

      const result = await client.query(query, [city_name, country_id])

      // Log creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["cities", result.rows[0].city_id, "CREATE", JSON.stringify({ city_name, country_id }), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "City created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create city error:", error)
      return ResponseHandler.error(res, "Failed to create city")
    } finally {
      client.release()
    }
  }

  // User Locations
  static async getUserLocations(req, res) {
    try {
      const { user_id } = req.query

      const query = `
        SELECT ul.*, c.country_name, ci.city_name
        FROM user_locations ul
        LEFT JOIN countries c ON ul.country_id = c.country_id
        LEFT JOIN cities ci ON ul.city_id = ci.city_id
      `

      const params = []
      
      if (user_id) {
        query += ` WHERE ul.user_id = $1`
        params.push(user_id)
      }

      const result = await db.query(query, params)
      return ResponseHandler.success(res, result.rows, "User locations retrieved successfully")
    } catch (error) {
      console.error("Get user locations error:", error)
      return ResponseHandler.error(res, "Failed to retrieve user locations")
    }
  }

  static async createUserLocation(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { user_id, country_id, city_id } = req.body

      const query = `
        INSERT INTO user_locations (user_id, country_id, city_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `

      const result = await client.query(query, [user_id, country_id, city_id])

      // Log creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["user_locations", result.rows[0].location_id, "CREATE", JSON.stringify(req.body), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "User location created successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Create user location error:", error)
      return ResponseHandler.error(res, "Failed to create user location")
    } finally {
      client.release()
    }
  }

  static async updateUserLocation(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { locationId } = req.params
      const { country_id, city_id } = req.body

      // Get current data for audit log
      const currentLocationResult = await client.query("SELECT * FROM user_locations WHERE location_id = $1", [locationId])

      if (currentLocationResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "User location not found")
      }

      const currentLocation = currentLocationResult.rows[0]

      const query = `
        UPDATE user_locations 
        SET country_id = $1, city_id = $2, updated_at = CURRENT_TIMESTAMP
        WHERE location_id = $3
        RETURNING *
      `

      const result = await client.query(query, [country_id, city_id, address_line1, address_line2, postal_code, locationId])

      if (result.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "User location not found")
      }

      const updatedLocation = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "user_locations",
          locationId,
          "UPDATE",
          JSON.stringify(currentLocation),
          JSON.stringify(updatedLocation),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedLocation, "User location updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update user location error:", error)
      return ResponseHandler.error(res, "Failed to update user location")
    } finally {
      client.release()
    }
  }

  static async deleteUserLocation(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { locationId } = req.params

      // Get current data for audit log
      const currentLocationResult = await client.query("SELECT * FROM user_locations WHERE location_id = $1", [locationId])

      if (currentLocationResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "User location not found")
      }

      const currentLocation = currentLocationResult.rows[0]

      const query = "DELETE FROM user_locations WHERE location_id = $1"
      await client.query(query, [locationId])

      // Log deletion
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["user_locations", locationId, "DELETE", JSON.stringify(currentLocation), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, null, "User location deleted successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Delete user location error:", error)
      return ResponseHandler.error(res, "Failed to delete user location")
    } finally {
      client.release()
    }
  }
  static async updateCountry(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { countryId } = req.params
      const { iso_code, country_name } = req.body

      // Get current data for audit log
      const currentCountryResult = await client.query("SELECT * FROM countries WHERE country_id = $1", [countryId])

      if (currentCountryResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Country not found")
      }

      const currentCountry = currentCountryResult.rows[0]

      const query = `
        UPDATE countries 
        SET iso_code = $1, country_name = $2, updated_at = CURRENT_TIMESTAMP
        WHERE country_id = $3
        RETURNING *
      `

      const result = await client.query(query, [iso_code, country_name, countryId])

      if (result.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Country not found")
      }

      const updatedCountry = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "countries",
          countryId,
          "UPDATE",
          JSON.stringify(currentCountry),
          JSON.stringify(updatedCountry),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedCountry, "Country updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update country error:", error)
      return ResponseHandler.error(res, "Failed to update country")
    } finally {
      client.release()
    }
  }

  static async deleteCountry(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { countryId } = req.params

      // Check if country has cities
      const cityCheck = await client.query(
        "SELECT COUNT(*) as count FROM cities WHERE country_id = $1",
        [countryId],
      )

      if (cityCheck.rows[0].count > 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Cannot delete country with existing cities", 400)
      }

      // Get current data for audit log
      const currentCountryResult = await client.query("SELECT * FROM countries WHERE country_id = $1", [countryId])

      if (currentCountryResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "Country not found")
      }

      const currentCountry = currentCountryResult.rows[0]

      // Delete country
      await client.query("DELETE FROM countries WHERE country_id = $1", [countryId])

      // Log deletion
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["countries", countryId, "DELETE", JSON.stringify(currentCountry), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, null, "Country deleted successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Delete country error:", error)
      return ResponseHandler.error(res, "Failed to delete country")
    } finally {
      client.release()
    }
  }

  static async updateCity(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { cityId } = req.params
      const { city_name, country_id } = req.body

      // Get current data for audit log
      const currentCityResult = await client.query("SELECT * FROM cities WHERE city_id = $1", [cityId])

      if (currentCityResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "City not found")
      }

      const currentCity = currentCityResult.rows[0]

      const query = `
        UPDATE cities 
        SET city_name = $1, country_id = $2, updated_at = CURRENT_TIMESTAMP
        WHERE city_id = $3
        RETURNING *
      `

      const result = await client.query(query, [city_name, country_id, cityId])

      if (result.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "City not found")
      }

      const updatedCity = result.rows[0]

      // Log update
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "cities",
          cityId,
          "UPDATE",
          JSON.stringify(currentCity),
          JSON.stringify(updatedCity),
          req.user.user_id,
        ],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, updatedCity, "City updated successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Update city error:", error)
      return ResponseHandler.error(res, "Failed to update city")
    } finally {
      client.release()
    }
  }

  static async deleteCity(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { cityId } = req.params

      // Check if city has user locations
      const locationCheck = await client.query(
        "SELECT COUNT(*) as count FROM user_locations WHERE city_id = $1",
        [cityId],
      )

      if (locationCheck.rows[0].count > 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.error(res, "Cannot delete city with existing user locations", 400)
      }

      // Get current data for audit log
      const currentCityResult = await client.query("SELECT * FROM cities WHERE city_id = $1", [cityId])

      if (currentCityResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "City not found")
      }

      const currentCity = currentCityResult.rows[0]

      // Delete city
      await client.query("DELETE FROM cities WHERE city_id = $1", [cityId])

      // Log deletion
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["cities", cityId, "DELETE", JSON.stringify(currentCity), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, null, "City deleted successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Delete city error:", error)
      return ResponseHandler.error(res, "Failed to delete city")
    } finally {
      client.release()
    }
  }

  static async assignUserLocation(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { user_id, country_id, city_id, address_line1, address_line2, postal_code } = req.body

      const query = `
        INSERT INTO user_locations (user_id, country_id, city_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `

      const result = await client.query(query, [user_id, country_id, city_id])

      // Log creation
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, new_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["user_locations", result.rows[0].location_id, "CREATE", JSON.stringify(req.body), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, result.rows[0], "User location assigned successfully", 201)
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Assign user location error:", error)
      return ResponseHandler.error(res, "Failed to assign user location")
    } finally {
      client.release()
    }
  }

  static async removeUserLocation(req, res) {
    const client = await db.getClient()

    try {
      await client.query("BEGIN")

      const { userLocationId } = req.params

      // Get current data for audit log
      const currentLocationResult = await client.query("SELECT * FROM user_locations WHERE location_id = $1", [userLocationId])

      if (currentLocationResult.rows.length === 0) {
        await client.query("ROLLBACK")
        return ResponseHandler.notFound(res, "User location not found")
      }

      const currentLocation = currentLocationResult.rows[0]

      const query = "DELETE FROM user_locations WHERE location_id = $1"
      await client.query(query, [userLocationId])

      // Log deletion
      await client.query(
        "INSERT INTO audit_logs (table_name, record_id, action_type, old_data, changed_by_user_id) VALUES ($1, $2, $3, $4, $5)",
        ["user_locations", userLocationId, "DELETE", JSON.stringify(currentLocation), req.user.user_id],
      )

      await client.query("COMMIT")

      return ResponseHandler.success(res, null, "User location removed successfully")
    } catch (error) {
      await client.query("ROLLBACK")
      console.error("Remove user location error:", error)
      return ResponseHandler.error(res, "Failed to remove user location")
    } finally {
      client.release()
    }
  }
}

module.exports = LocationController
