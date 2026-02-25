const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { sendError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { z, validateParams } = require('../validation');

// Path to avatars directory
const AVATARS_DIR = path.join(__dirname, '..', 'static', 'avatars');

const avatarIdParamsSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/)
});

// Ensure avatars directory exists
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  logger.info('Created avatars directory', { path: AVATARS_DIR });
}

const createAvatarsRoutes = () => {
  // GET /api/avatars - Get list of available avatars (with caching)
  router.get('/', async (req, res) => {
    try {
      // Try to get from cache first
      const cacheKey = 'avatars:list';
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug('Avatars cache hit');
        return res.json({ ok: true, avatars: cached, _cached: true });
      }

      const avatars = [];
      
      // Read avatars directory
      if (fs.existsSync(AVATARS_DIR)) {
        const files = fs.readdirSync(AVATARS_DIR);
        
        // Filter image files
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
        const imageFiles = files.filter(file => {
          const ext = path.extname(file).toLowerCase();
          return imageExtensions.includes(ext);
        });

        // Create avatar list with URLs
        imageFiles.forEach((file, index) => {
          const filePath = path.join(AVATARS_DIR, file);
          const stats = fs.statSync(filePath);
          const ext = path.extname(file).toLowerCase();
          const name = path.basename(file, ext);
          
          avatars.push({
            id: name,
            name: name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' '),
            url: `/api/static/avatars/${file}`,
            filename: file,
            size: stats.size,
            createdAt: stats.birthtime
          });
        });

        // Sort by name
        avatars.sort((a, b) => a.name.localeCompare(b.name));
      }

      // Cache for 1 hour (avatars don't change often)
      await cache.set(cacheKey, avatars, 3600);

      logger.debug('Avatars list fetched', { count: avatars.length });
      return res.json({ ok: true, avatars });
    } catch (error) {
      logger.error('Get avatars error:', { error: error?.message || error });
      return sendError(res, 500, 'AVATARS_FETCH_FAILED', 'Failed to fetch avatars');
    }
  });

  // GET /api/avatars/:id - Get specific avatar info
  router.get('/:id', validateParams(avatarIdParamsSchema), async (req, res) => {
    try {
      const { id } = req.params;
      
      if (fs.existsSync(AVATARS_DIR)) {
        const files = fs.readdirSync(AVATARS_DIR);
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
        
        // Find avatar file
        const avatarFile = files.find(file => {
          const ext = path.extname(file).toLowerCase();
          const name = path.basename(file, ext);
          return name === id && imageExtensions.includes(ext);
        });

        if (avatarFile) {
          const filePath = path.join(AVATARS_DIR, avatarFile);
          const stats = fs.statSync(filePath);
          const ext = path.extname(avatarFile).toLowerCase();
          const name = path.basename(avatarFile, ext);
          
          return res.json({
            ok: true,
            avatar: {
              id: name,
              name: name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' '),
              url: `/api/static/avatars/${avatarFile}`,
              filename: avatarFile,
              size: stats.size,
              createdAt: stats.birthtime
            }
          });
        }
      }

      return sendError(res, 404, 'AVATAR_NOT_FOUND', 'Avatar not found');
    } catch (error) {
      logger.error('Get avatar error:', { error: error?.message || error });
      return sendError(res, 500, 'AVATAR_FETCH_FAILED', 'Failed to fetch avatar');
    }
  });

  return router;
};

module.exports = { createAvatarsRoutes };
