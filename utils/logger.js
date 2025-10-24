// /utils/logger.js
import winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
  if (Object.keys(meta).length > 0) {
    msg += ' ' + JSON.stringify(meta, null, 2);
  }
  return msg;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: combine(
    timestamp(),
    process.env.NODE_ENV === 'production'
      ? printf(({ level, message, timestamp }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
      : colorize(),
    logFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: 'logs/%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
  ],
});

// Custom helper methods
logger.audit = (message, meta = {}) => logger.info(message, { ...meta, logType: 'AUDIT' });
logger.security = (message, meta = {}) => logger.warn(message, { ...meta, logType: 'SECURITY' });

// Add a "fatal" alias (used in index.js)
logger.fatal = (message, meta = {}) => logger.error(`[FATAL] ${message}`, meta);

export { logger };
