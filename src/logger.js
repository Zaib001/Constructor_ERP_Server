const winston = require('winston');
const path = require('path');

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
            format: logFormat,
        }),
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log'),
            format: logFormat,
        }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        })
    );
}

module.exports = logger;
