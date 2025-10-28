// utils/EncryptionUtil.js
const crypto = require("crypto");

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "utf8"); // 32 bytes
const IV_LENGTH = 16; // AES block size

class EncryptionUtil {
  /**
   * Encrypt a plain text string
   * @param {string} text
   * @returns {string} iv:encryptedHex
   */
  static encrypt(text) {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      // return as iv:encryptedHex
      return iv.toString("hex") + ":" + encrypted;
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Encryption failed");
    }
  }

  /**
   * Decrypt an AES-256-CBC encrypted string
   * @param {string} text iv:encryptedHex
   * @returns {string} decrypted text
   */
  static decrypt(text) {
    try {
      const [ivHex, encryptedHex] = text.split(":");
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);

      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error("Decryption failed");
    }
  }

  /**
   * Encrypt an object (auto converts to JSON)
   * @param {object} obj
   * @returns {string} iv:encryptedHex
   */
  static encryptObject(obj) {
    try {
      const jsonString = JSON.stringify(obj);
      return this.encrypt(jsonString);
    } catch (error) {
      console.error("Object encryption error:", error);
      throw new Error("Object encryption failed");
    }
  }

  /**
   * Decrypt an encrypted JSON string back into an object
   * @param {string} encryptedText
   * @returns {object}
   */
  static decryptObject(encryptedText) {
    try {
      const decryptedString = this.decrypt(encryptedText);
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error("Object decryption error:", error);
      throw new Error("Object decryption failed");
    }
  }

  /**
   * Generate SHA-256 hash of data
   * @param {string} data
   * @returns {string} hash
   */
  static hashData(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}

// Add named helper exports for common usage (keeps backwards compatibility)
module.exports = {
  EncryptionUtil,
  encryptText: (text) => EncryptionUtil.encrypt(text),
  decryptText: (text) => EncryptionUtil.decrypt(text),
  encryptObject: (obj) => EncryptionUtil.encryptObject(obj),
  decryptObject: (encryptedText) => EncryptionUtil.decryptObject(encryptedText),
  hashData: (data) => EncryptionUtil.hashData(data),
};
