"use strict";

const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize, errors, json } = format;
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Redactor helper to scrub sensitive data from logs
function redactSecrets(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (obj instanceof Error) return obj; // Preserve errors
  
  const scrubbed = Array.isArray(obj) ? [] : {};
  for (const [key, val] of Object.entries(obj)) {
    if (/secret|password|token|private_key|client_id|client_secret|key_encrypted|certificate_pem/i.test(key)) {
      scrubbed[key] = "[REDACTED_SECRET]";
    } else if (typeof val === "object" && val !== null) {
      scrubbed[key] = redactSecrets(val);
    } else {
      scrubbed[key] = val;
    }
  }
  return scrubbed;
}

// Custom log format: [timestamp] LEVEL: message  { metadata }
const logFormat = printf(({ level, message, timestamp: ts, requestId, correlationId, stack, ...meta }) => {
  const rid = requestId ? ` [Req: ${requestId} / Corr: ${correlationId || requestId}]` : "";
  const stackTrace = stack ? `\n${stack}` : "";
  const cleanMeta = redactSecrets(meta);
  const metaStr = Object.keys(cleanMeta).length ? ` ${JSON.stringify(cleanMeta)}` : "";
  return `${ts}${rid} ${level}: ${message}${metaStr}${stackTrace}`;
});

// Format to inject context tracing variables dynamically
const injectContext = format((info) => {
  try {
    const { getContext } = require("./context");
    const store = getContext();
    if (store) {
      if (store.requestId) info.requestId = store.requestId;
      if (store.correlationId) info.correlationId = store.correlationId;
      if (store.userId) info.userId = store.userId;
      if (store.companyId) info.companyId = store.companyId;
    }
  } catch (err) {
    // Avoid crashing on context import
  }
  return info;
});

const isProd = process.env.NODE_ENV === "production";

const isQuiet = process.env.LOG_QUIET === "true";

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  silent: isQuiet,
  format: combine(
    injectContext(),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    isProd ? json() : logFormat
  ),
  transports: [
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        logFormat
      ),
    }),
    new transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    }),
    new transports.File({
      filename: path.join(logsDir, "combined.log"),
    }),
  ],
  exitOnError: false,
});

module.exports = logger;
