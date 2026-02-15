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

// Helper to send error from AppError instance
const sendAppError = (res, appError) => {
  return sendError(
    res,
    appError.statusCode,
    appError.code,
    appError.message,
    appError.details
  );
};

module.exports = { sendError, sendValidationError, sendAppError };
