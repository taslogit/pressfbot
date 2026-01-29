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

// Cache stampede protection: track pending requests
const pendingRequests = new Map();

const cache = {
  // Get value from cache with stampede protection
  get: async (key) => {
    if (!redisClient) return null;
    try {
      const value = await redisClient.get(key);
      if (value) {
        return JSON.parse(value);
      }
      
      // Cache stampede protection: if another request is already fetching this key, wait for it
      if (pendingRequests.has(key)) {
        logger.debug(`Cache stampede protection: waiting for pending request for key ${key}`);
        return await pendingRequests.get(key);
      }
      
      return null;
    } catch (error) {
      logger.warn(`Cache get error for key ${key}`, { error: error.message });
      return null;
    }
  },
  
  // Get or set pattern with stampede protection
  getOrSet: async (key, fetchFn, ttl = 300) => {
    if (!redisClient) {
      // If cache is not available, just fetch directly
      return await fetchFn();
    }
    
    try {
      // Try to get from cache first
      const cached = await cache.get(key);
      if (cached !== null) {
        return cached;
      }
      
      // Check if another request is already fetching
      if (pendingRequests.has(key)) {
        logger.debug(`Cache stampede protection: waiting for pending fetch for key ${key}`);
        return await pendingRequests.get(key);
      }
      
      // Create promise for this fetch
      const fetchPromise = (async () => {
        try {
          const value = await fetchFn();
          await cache.set(key, value, ttl);
          return value;
        } finally {
          // Remove from pending requests
          pendingRequests.delete(key);
        }
      })();
      
      pendingRequests.set(key, fetchPromise);
      return await fetchPromise;
    } catch (error) {
      pendingRequests.delete(key);
      logger.warn(`Cache getOrSet error for key ${key}`, { error: error.message });
      // Fallback to direct fetch
      return await fetchFn();
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

  // Delete by pattern (alias for delPattern)
  delByPattern: async (pattern) => {
    return cache.delPattern(pattern);
  },

  // Invalidate cache by tags (if using cache tags)
  invalidateByTags: async (tags) => {
    if (!redisClient || !Array.isArray(tags)) return false;
    try {
      // Delete all keys with these tags
      for (const tag of tags) {
        await cache.delPattern(`tag:${tag}:*`);
      }
      return true;
    } catch (error) {
      logger.warn(`Cache invalidate by tags error`, { error: error.message, tags });
      return false;
    }
  },

  // Ping Redis to check connection
  ping: async () => {
    if (!redisClient) return false;
    try {
      const result = await redisClient.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  },

  // Check if cache is available
  isAvailable: () => redisClient !== null
};

module.exports = { initCache, cache };
