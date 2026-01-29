// Simple structured logger utility
// In production, replace with winston/pino

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG');
const CURRENT_LEVEL = LOG_LEVELS[LOG_LEVEL] || LOG_LEVELS.INFO;

const formatMessage = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data })
  };
  return JSON.stringify(logEntry);
};

const logger = {
  error: (message, error = null) => {
    if (CURRENT_LEVEL >= LOG_LEVELS.ERROR) {
      const data = error ? {
        message: error.message,
        stack: error.stack,
        ...(error.code && { code: error.code })
      } : null;
      console.error(formatMessage('ERROR', message, data));
    }
  },

  warn: (message, data = null) => {
    if (CURRENT_LEVEL >= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', message, data));
    }
  },

  info: (message, data = null) => {
    if (CURRENT_LEVEL >= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', message, data));
    }
  },

  debug: (message, data = null) => {
    if (CURRENT_LEVEL >= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', message, data));
    }
  }
};

module.exports = logger;
