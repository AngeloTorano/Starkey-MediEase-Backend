const express = require("express");
const router = express.Router();
const { sendScheduleSMS, sendOTP, verifyOTP, testSMS } = require("../controllers/smsController");

router.post("/send-schedule", sendScheduleSMS);
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/test", testSMS);


module.exports = router;
