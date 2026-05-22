require("dotenv").config();

const http = require("http");
const app = require("./app");
const logger = require("./logger");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const { assertStartupConfig } = require("./modules/finance/startup.validator");
const { startZATCAWorker } = require("./modules/finance/zatca/zatca.worker");
const { startProfitabilityWorker } = require("./modules/finance/profitability/profitability.worker");

// Run startup config assertions first
assertStartupConfig()
  .then(() => {
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      
      // Start background workers
      startZATCAWorker(30000);
      startProfitabilityWorker(30000);
    });
  })
  .catch(err => {
    logger.error("Startup validation failed: critical configuration missing. Halting server.", err);
    process.exit(1);
  });


// ================= GLOBAL ERROR HANDLING =================

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", {
    message: err.message,
    stack: err.stack,
  });

  // Exit only in production
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);

  if (process.env.NODE_ENV === "production") {
    server.close(() => {
      process.exit(1);
    });
  }
});
 
