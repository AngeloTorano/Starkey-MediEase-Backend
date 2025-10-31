const axios = require("axios");

const HTTPSMS_BASE_URL = process.env.HTTPSMS_BASE_URL || "https://api.httpsms.com";
const HTTPSMS_API_KEY = "uk_pBxkJLNmPH6u8vL7si5dDGjVmzOlAXJINdy4nW5ebCID5W3THPH8fTylcNULzmqD"
const SENDER_NUMBER = process.env.HTTPSMS_SENDER_NUMBER;

const sendSMS = async (numbers, message) => {
  if (!HTTPSMS_API_KEY) {
    console.error("❌ Missing HTTPSMS_API_KEY environment variable.");
    throw new Error("Missing HTTPSMS_API_KEY");
  }

  try {
    for (const number of numbers) {
      const payload = {
        content: message,
        from: SENDER_NUMBER, // fallback sender name
        to: number,
      };

      const response = await axios.post(
        `${HTTPSMS_BASE_URL}/v1/messages/send`,
        payload,
        {
          headers: {
            "x-api-key": HTTPSMS_API_KEY,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`✅ SMS sent to ${number}:`, response.data);
    }
  } catch (error) {
    console.error(
      "❌ Error sending SMS via httpsms:",
      error.response?.data || error.message
    );
    throw new Error("Failed to send SMS via httpsms");
  }
};

module.exports = { sendSMS };
