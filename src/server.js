require("dotenv").config();

const http = require("http");
const app = require("./app");
const logger = require("./logger");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
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
