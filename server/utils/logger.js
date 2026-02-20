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

// Generate request ID for correlation tracking
let requestIdCounter = 0;
const generateRequestId = () => {
  requestIdCounter = (requestIdCounter + 1) % 1000000;
  return `req_${Date.now()}_${requestIdCounter}`;
};

const formatMessage = (level, message, data = null, context = null) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(context && { context }),
    ...(data && { data })
  };
  return JSON.stringify(logEntry);
};

const logger = {
  error: (message, error = null, context = null) => {
    if (CURRENT_LEVEL >= LOG_LEVELS.ERROR) {
      const data = error != null ? {
        message: error?.message ?? (typeof error === 'string' ? error : String(error)),
        stack: error?.stack,
        ...(error?.code && { code: error.code }),
        ...(error?.name && { name: error.name }),
        ...(error?.statusCode && { statusCode: error.statusCode })
      } : null;
      
      // Enhanced context for errors
      const enhancedContext = context ? {
        ...context,
        ...(context.userId && { userId: context.userId }),
        ...(context.path && { path: context.path }),
        ...(context.method && { method: context.method }),
        ...(context.ip && { ip: context.ip })
      } : null;
      
      console.error(formatMessage('ERROR', message, data, enhancedContext));
    }
  },

  warn: (message, data = null, context = null) => {
    if (CURRENT_LEVEL >= LOG_LEVELS.WARN) {
      const enhancedContext = context ? {
        ...context,
        ...(context.userId && { userId: context.userId }),
        ...(context.path && { path: context.path })
      } : null;
      console.warn(formatMessage('WARN', message, data, enhancedContext));
    }
  },

  info: (message, data = null, context = null) => {
    if (CURRENT_LEVEL >= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', message, data, context));
    }
  },

  debug: (message, data = null, context = null) => {
    if (CURRENT_LEVEL >= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', message, data, context));
    }
  }
};

module.exports = logger;
