// Centralized error handling middleware
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const { sendError } = require('../utils/errors');

/**
 * Global error handler middleware
 * Should be used as the last middleware in Express app
 */
const errorHandler = (err, req, res, next) => {
  // Log error details
  const errorDetails = {
    error: err.message || err,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.userId || null,
    ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'],
    body: req.body ? JSON.stringify(req.body).substring(0, 500) : null, // Limit body size in logs
    query: req.query ? JSON.stringify(req.query) : null
  };

  // Handle known operational errors (AppError instances)
  if (err instanceof AppError) {
    logger.warn('Operational error', {
      ...errorDetails,
      statusCode: err.statusCode,
      code: err.code
    });

    return sendError(
      res,
      err.statusCode,
      err.code,
      err.message,
      process.env.NODE_ENV === 'production' ? null : err.details
    );
  }

  // Handle validation errors (Zod)
  if (err.name === 'ZodError') {
    logger.warn('Validation error', errorDetails);
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Invalid request payload',
      process.env.NODE_ENV === 'production' ? null : err.errors
    );
  }

  // Handle database errors
  if (err.code && err.code.startsWith('23')) { // PostgreSQL constraint violations
    logger.error('Database constraint error', errorDetails);
    return sendError(
      res,
      400,
      'DATABASE_CONSTRAINT_ERROR',
      'Database constraint violation',
      process.env.NODE_ENV === 'production' ? null : { code: err.code }
    );
  }

  if (err.code === '23505') { // Unique violation
    logger.warn('Unique constraint violation', errorDetails);
    return sendError(
      res,
      409,
      'DUPLICATE_ENTRY',
      'Resource already exists',
      process.env.NODE_ENV === 'production' ? null : { field: err.detail }
    );
  }

  // Handle connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    logger.error('Connection error', errorDetails);
    return sendError(
      res,
      503,
      'SERVICE_UNAVAILABLE',
      'Service temporarily unavailable',
      null
    );
  }

  // Handle unknown errors
  logger.error('Unhandled error', errorDetails);

  // Don't expose error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'An unexpected error occurred';

  return sendError(
    res,
    err.statusCode || 500,
    err.code || 'INTERNAL_ERROR',
    message,
    process.env.NODE_ENV === 'production' ? null : {
      stack: err.stack,
      ...(err.details && { details: err.details })
    }
  );
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res) => {
  return sendError(
    res,
    404,
    'ROUTE_NOT_FOUND',
    `Route ${req.method} ${req.path} not found`,
    null
  );
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler
};
