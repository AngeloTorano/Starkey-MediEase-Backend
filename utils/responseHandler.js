const EncryptionUtil = require("./encryption")

class ResponseHandler {
  static success(res, data, message = "Success", statusCode = 200) {
    const response = {
      success: true,
      message,
      data: data || null,
      timestamp: new Date().toISOString(),
    }

    // Encrypt sensitive data
    if (data && typeof data === "object") {
      response.encrypted_data = EncryptionUtil.encryptObject(data)
      response.data_hash = EncryptionUtil.hashData(JSON.stringify(data))
      delete response.data // Remove plain data
    }

    return res.status(statusCode).json(response)
  }

  static error(res, message = "Error occurred", statusCode = 500, details = null) {
    const response = {
      success: false,
      message,
      error: details,
      timestamp: new Date().toISOString(),
    }

    return res.status(statusCode).json(response)
  }

  static unauthorized(res, message = "Unauthorized access") {
    return this.error(res, message, 401)
  }

  static forbidden(res, message = "Forbidden access") {
    return this.error(res, message, 403)
  }

  static notFound(res, message = "Resource not found") {
    return this.error(res, message, 404)
  }

  static validationError(res, errors) {
    return this.error(res, "Validation failed", 400, errors)
  }
}

module.exports = ResponseHandler
