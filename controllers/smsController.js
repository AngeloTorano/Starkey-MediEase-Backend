const db = require("../config/database");
const crypto = require("crypto");
const axios = require("axios");

// ✅ Load ENV Variables
const HTTPSMS_BASE_URL = process.env.HTTPSMS_BASE_URL || "https://api.httpsms.com";
const HTTPSMS_API_KEY = process.env.HTTPSMS_API_KEY;
const SENDER_NUMBER = process.env.HTTPSMS_SENDER_NUMBER;

// ✅ Format PH Numbers
const formatNumber = (number) => {
  let cleaned = number.replace(/\D/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith("63")) cleaned = "63" + cleaned;
  return "+" + cleaned;
};

// ✅ Generic SMS Sender
const sendSMS = async (numbers, message) => {
  if (!HTTPSMS_API_KEY || !SENDER_NUMBER) {
    throw new Error("Missing required SMS env variables!");
  }

  for (const rawNumber of numbers) {
    const toNumber = formatNumber(rawNumber);

    const payload = {
      content: message,
      from: SENDER_NUMBER,
      to: toNumber
    };

    try {
      const response = await axios.post(
        `${HTTPSMS_BASE_URL}/v1/messages/send`,
        payload,
        {
          headers: {
            "x-api-key": HTTPSMS_API_KEY,
            Accept: "application/json",
            "Content-Type": "application/json"
          }
        }
      );


    } catch (error) {
      console.error("❌ SMS Error:", error.response?.data || error.message);
      throw new Error(
        error.response?.data?.failure_reason || "SMS Sending Failed"
      );
    }
  }
};

class SmsController {
  // ✅ Send AfterCare Schedule SMS by City
  static async sendScheduleSMS(req, res) {
    const { AfterCareCity, message } = req.body;

    try {
      const { rows: patients } = await db.query(
        "SELECT mobile_number FROM patients WHERE city_village = $1",
        [AfterCareCity]
      );

      if (patients.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No patients found in this city."
        });
      }

      const phoneNumbers = patients.map(p => p.mobile_number);

      await sendSMS(phoneNumbers, message);

      await db.query(
        "INSERT INTO sms_messages (message_type, message_content, recipient_count, recipients) VALUES ($1,$2,$3,$4)",
        ["Schedule", message, phoneNumbers.length, phoneNumbers.join(",")]
      );

      return res.status(200).json({
        success: true,
        message: `Message sent to ${phoneNumbers.length} patients in ${AfterCareCity}.`
      });

    } catch (error) {
      console.error("❌ Schedule SMS Error:", error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ✅ Generate OTP + Send to Patient
  static async sendOTP(req, res) {
    const { user_id, phone_number } = req.body;

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
      await db.query(
        "INSERT INTO otp_codes (user_id, otp_code, expires_at) VALUES ($1,$2,$3)",
        [user_id, otp, expiresAt]
      );

      await sendSMS([phone_number], `Your OTP is ${otp}. It expires in 5 minutes.`);

      await db.query(
        "INSERT INTO sms_messages (message_type, message_content, recipient_count, recipients) VALUES ($1,$2,$3,$4)",
        ["OTP", `OTP for user ${user_id}`, 1, phone_number]
      );

      res.status(200).json({ success: true, message: "OTP sent successfully!" });

    } catch (error) {
      console.error("❌ OTP Error:", error.message);
      res.status(500).json({ success: false, message: "Error sending OTP." });
    }
  }

  // ✅ Verify OTP
  static async verifyOTP(req, res) {
    const { user_id, otp_code } = req.body;

    try {
      const { rows } = await db.query(
        "SELECT * FROM otp_codes WHERE user_id = $1 AND otp_code = $2 AND is_verified = false",
        [user_id, otp_code]
      );

      if (rows.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid OTP." });
      }

      const otp = rows[0];
      if (new Date() > new Date(otp.expires_at)) {
        return res.status(400).json({ success: false, message: "OTP expired." });
      }

      await db.query(
        "UPDATE otp_codes SET is_verified = true WHERE otp_id = $1",
        [otp.otp_id]
      );

      return res.status(200).json({ success: true, message: "OTP verified!" });

    } catch (error) {
      console.error("❌ Verify OTP Error:", error.message);
      res.status(500).json({ success: false, message: "Verification failed." });
    }
  }

  // ✅ Test SMS Route
  static async testSMS(req, res) {
    const { phone_number, message } = req.body;

    if (!phone_number || !message) {
      return res.status(400).json({
        success: false,
        message: "phone_number & message required"
      });
    }

    try {
      await sendSMS([phone_number], message);

      res.status(200).json({
        success: true,
        message: `Test SMS sent to ${phone_number}`
      });

    } catch (error) {
      console.error("❌ Test SMS Error:", error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // NEW: Get sent messages (latest first)
  static async getMessages(req, res) {
    const limit = parseInt(req.query.limit, 10) || 50;
    try {
      const { rows } = await db.query(
        `SELECT 
           sms_id, message_type, message_content, recipient_count, recipients, created_at
         FROM sms_messages
         WHERE message_type = 'Schedule'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );

      return res.status(200).json({ success: true, data: rows });
    } catch (error) {
      console.error("❌ Get Messages Error:", error.message);
      return res.status(500).json({ success: false, message: "Failed to fetch messages." });
    }
  }
}

module.exports = SmsController;
