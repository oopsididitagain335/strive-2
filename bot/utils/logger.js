// /bot/utils/logger.js
import winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, printf, colorize, json } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
  if (Object.keys(meta).length > 0) {
    msg += ' ' + JSON.stringify(meta, null, 2);
  }
  return msg;
});

const logger = winston.createLogger({
  level: 'debug',
  format: combine(
    timestamp(),
    process.env.NODE_ENV === 'production' ? json() : colorize(),
    logFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: 'logs/strive-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

// Custom audit & security levels
logger.audit = (message, meta = {}) => logger.info(message, { ...meta, logType: 'AUDIT' });
logger.security = (message, meta = {}) => logger.warn(message, { ...meta, logType: 'SECURITY' });

export { logger };
