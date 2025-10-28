const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

// Import all routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const patientRoutes = require("./routes/patients");
const supplyRoutes = require("./routes/supplies");
const phaseRoutes = require("./routes/phases");
const locationRoutes = require("./routes/locations");
const phase1Routes = require("./routes/phase1");
const phase2Routes = require("./routes/phase2");
const phase3Routes = require("./routes/phase3");
const auditRoutes = require("./routes/audit");
const dashboardRoutes = require("./routes/dashboard");
const reportsRoutes = require("./routes/reportsRoutes")

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
});
app.use(limiter);

// Logging
app.use(morgan("combined"));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the SHF Backend API",
    version: "1.0.0",
    documentation: process.env.DOCS_URL || "No documentation URL set",
    endpoints: {
      auth: "/api/auth",
      users: "/api/users",
      patients: "/api/patients",
      supplies: "/api/supplies",
      phases: "/api/phases",
      locations: "/api/locations",
      audit: "/api/audit",
      dashboard: "/api/dashboard",
    },
    healthCheck: "/health",
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime(),
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/supplies", supplyRoutes);
app.use("/api/phases", phaseRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/phase1", phase1Routes);
app.use("/api/phase2", phase2Routes);
app.use("/api/phase3", phase3Routes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportsRoutes)

// 404 handler - MUST be after all other routes
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    suggestedEndpoints: {
      apiDocumentation: "/",
      healthCheck: "/health",
    },
  });
});

// Error handling middleware - MUST be after all other middleware/routes
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation Error",
      details: err.details,
    });
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  // Handle rate limit errors
  if (err.status === 429) {
    return res.status(429).json({
      error: "Too many requests",
      message: err.message,
    });
  }

  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Healthcare Backend Server running on port http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  server.close(() => process.exit(1));
});

module.exports = app;