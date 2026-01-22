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

module.exports = { z, validateBody };
