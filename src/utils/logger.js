"use strict";

const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize, errors } = format;
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format: [timestamp] LEVEL: message  { metadata }
const logFormat = printf(({ level, message, timestamp: ts, requestId, stack, ...meta }) => {
  const rid = requestId ? ` [${requestId}]` : "";
  const stackTrace = stack ? `\n${stack}` : "";
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${ts}${rid} ${level}: ${message}${metaStr}${stackTrace}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Console: colourised for dev, plain for prod
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        logFormat
      ),
    }),
    // Error-only file
    new transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    }),
    // All levels file
    new transports.File({
      filename: path.join(logsDir, "combined.log"),
    }),
  ],
  // Prevent Winston from crashing on uncaught errors in logging itself
  exitOnError: false,
});

module.exports = logger;

