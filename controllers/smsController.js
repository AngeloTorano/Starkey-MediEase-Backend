const db = require("../config/database");
const { sendSMS } = require("../utils/smsSender");
const crypto = require("crypto");

class SmsController {
  // 📩 Send schedule message to patients by city
  static async sendScheduleSMS(req, res) {
    const { AfterCareCity, message } = req.body;

    try {
      const { rows: patients } = await db.query(
        "SELECT phone_number FROM patients WHERE aftercare_city = $1",
        [AfterCareCity]
      );

      if (patients.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "No patients found for this city." });
      }

      const phoneNumbers = patients.map((p) => p.phone_number);
      await sendSMS(phoneNumbers, message);

      await db.query(
        "INSERT INTO sms_messages (message_type, message_content, recipient_count, recipients) VALUES ($1, $2, $3, $4)",
        ["Schedule", message, phoneNumbers.length, phoneNumbers.join(",")]
      );

      res.status(200).json({
        success: true,
        message: `Message sent to ${phoneNumbers.length} patients in ${AfterCareCity}.`,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: "Error sending SMS." });
    }
  }

  // 🔐 Generate OTP and send to user
  static async sendOTP(req, res) {
    const { user_id, phone_number } = req.body;
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
      await db.query(
        "INSERT INTO otp_codes (user_id, otp_code, expires_at) VALUES ($1, $2, $3)",
        [user_id, otp, expiresAt]
      );

      await sendSMS([phone_number], `Your verification code is ${otp}. It expires in 5 minutes.`);

      await db.query(
        "INSERT INTO sms_messages (message_type, message_content, recipient_count, recipients) VALUES ($1, $2, $3, $4)",
        ["OTP", `OTP for user ${user_id}`, 1, phone_number]
      );

      res.status(200).json({ success: true, message: "OTP sent successfully." });
    } catch (error) {
      console.error(error);
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

      if (rows.length === 0)
        return res.status(400).json({ success: false, message: "Invalid OTP." });

      const otp = rows[0];
      if (new Date() > new Date(otp.expires_at))
        return res.status(400).json({ success: false, message: "OTP expired." });

      await db.query("UPDATE otp_codes SET is_verified = true WHERE otp_id = $1", [otp.otp_id]);

      res.status(200).json({ success: true, message: "OTP verified successfully." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: "Error verifying OTP." });
    }
  }

static async testSMS(req, res) {
  const { phone_number, message } = req.body;

  try {
    if (!phone_number || !message) {
      return res.status(400).json({ 
        success: false, 
        message: "phone_number and message are required." 
      });
    }

    console.log(`📤 Sending test SMS to ${phone_number}...`);

    await sendSMS([phone_number], message);

    return res.status(200).json({
      success: true,
      message: `Test SMS sent successfully to ${phone_number}.`
    });

  } catch (error) {
    console.error("❌ Test SMS error:", error.response?.data || error.message);

    // If the HTTPSMS API sent a response, include its details
    if (error.response?.data) {
      return res.status(500).json({
        success: false,
        message: "Failed to send SMS via HTTPSMS.",
        error: error.response.data, // Return actual response from HTTPSMS
      });
    }

    // Fallback for unexpected errors
    return res.status(500).json({ 
      success: false, 
      message: "Unexpected error occurred while sending SMS.",
      error: error.message 
    });
  }
}

}

module.exports = SmsController;
