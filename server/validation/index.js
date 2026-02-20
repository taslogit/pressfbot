const { z } = require('zod');
const { sendValidationError } = require('../utils/errors');

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return sendValidationError(res, result.error);
  }
  req.body = result.data;
  next();
};

// Security: Validate query parameters using Zod schemas
// Query params are always strings, so schemas should handle string->number transformation
const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return sendValidationError(res, result.error);
  }
  // Merge validated data back into req.query (preserve other params)
  req.query = { ...req.query, ...result.data };
  next();
};

// Security: Validate URL parameters using Zod schemas
const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    return sendValidationError(res, result.error);
  }
  req.params = result.data;
  next();
};

module.exports = { z, validateBody, validateQuery, validateParams };
