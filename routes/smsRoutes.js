const express = require("express");
const router = express.Router();
const { sendScheduleSMS, sendOTP, verifyOTP, testSMS, getMessages } = require("../controllers/smsController");

router.post("/send-schedule", sendScheduleSMS);
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/test", testSMS);
router.get("/messages", getMessages);


module.exports = router;
