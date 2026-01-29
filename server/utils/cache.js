// Redis cache utility
// Provides caching layer for frequently accessed data

const logger = require('./logger');

let redisClient = null;

const initCache = (redisUrl) => {
  if (!redisUrl) {
    return null;
  }
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis cache error', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis cache connected');
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis cache', error);
    return null;
  }
};

const cache = {
  // Get value from cache
  get: async (key) => {
    if (!redisClient) return null;
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn(`Cache get error for key ${key}`, { error: error.message });
      return null;
    }
  },

  // Set value in cache with TTL (time to live in seconds)
  set: async (key, value, ttl = 300) => {
    if (!redisClient) return false;
    try {
      const serialized = JSON.stringify(value);
      await redisClient.setex(key, ttl, serialized);
      return true;
    } catch (error) {
      logger.warn(`Cache set error for key ${key}`, { error: error.message });
      return false;
    }
  },

  // Delete value from cache
  del: async (key) => {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.warn(`Cache delete error for key ${key}`, { error: error.message });
      return false;
    }
  },

  // Delete multiple keys by pattern
  delPattern: async (pattern) => {
    if (!redisClient) return false;
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return true;
    } catch (error) {
      logger.warn(`Cache delete pattern error for ${pattern}`, { error: error.message });
      return false;
    }
  },

  // Check if cache is available
  isAvailable: () => redisClient !== null
};

module.exports = { initCache, cache };
