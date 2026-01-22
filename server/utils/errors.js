const sendError = (res, status, code, message, details) => {
  return res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      details
    }
  });
};

const sendValidationError = (res, zodError) => {
  return sendError(
    res,
    400,
    'VALIDATION_ERROR',
    'Invalid request payload',
    zodError.flatten()
  );
};

module.exports = { sendError, sendValidationError };
