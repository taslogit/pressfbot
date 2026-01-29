// Middleware for monitoring request performance
// Logs request duration and can be extended with metrics collection

const logger = require('../utils/logger');

const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const memoryDelta = process.memoryUsage();
    
    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        userId: req.userId,
        memoryDelta: {
          heapUsed: `${Math.round((memoryDelta.heapUsed - startMemory.heapUsed) / 1024 / 1024)}MB`,
          rss: `${Math.round((memoryDelta.rss - startMemory.rss) / 1024 / 1024)}MB`
        }
      });
    } else {
      logger.debug('Request completed', {
        method: req.method,
        path: req.path,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
    }
    
    // Call original end
    originalEnd.apply(this, args);
  };
  
  next();
};

module.exports = performanceMonitor;
