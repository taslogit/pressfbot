// Middleware to validate request body size
// Prevents large payloads from consuming server resources

const logger = require('../utils/logger');

// Default limits (in bytes)
const DEFAULT_LIMITS = {
  json: 1024 * 1024, // 1MB for JSON
  text: 5 * 1024 * 1024, // 5MB for text
  urlencoded: 1024 * 1024, // 1MB for form data
};

// Custom limits per endpoint
const ENDPOINT_LIMITS = {
  '/api/letters': {
    json: 10 * 1024 * 1024, // 10MB for letters (may contain attachments)
  },
  '/api/legacy': {
    json: 5 * 1024 * 1024, // 5MB for legacy items
  },
};

const bodySizeLimit = (req, res, next) => {
  const contentLength = req.get('content-length');
  
  if (!contentLength) {
    return next();
  }

  const size = parseInt(contentLength, 10);
  
  if (isNaN(size) || size < 0) {
    return res.status(400).json({
      ok: false,
      error: 'INVALID_CONTENT_LENGTH',
      message: 'Invalid Content-Length header'
    });
  }

  // Get limit for this endpoint
  let limit = DEFAULT_LIMITS.json;
  const endpoint = Object.keys(ENDPOINT_LIMITS).find(path => req.path.startsWith(path));
  if (endpoint) {
    limit = ENDPOINT_LIMITS[endpoint].json || limit;
  }

  if (size > limit) {
    logger.warn('Request body too large', {
      path: req.path,
      size,
      limit,
      userId: req.userId
    });
    
    return res.status(413).json({
      ok: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: `Request body exceeds maximum size of ${Math.round(limit / 1024 / 1024)}MB`
    });
  }

  next();
};

module.exports = bodySizeLimit;
