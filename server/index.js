// Simple Express + Telegraf backend for Press F
const express = require('express');
const { Telegraf } = require('telegraf');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { sendError } = require('./utils/errors');
const logger = require('./utils/logger');
const { initCache, cache } = require('./utils/cache');

// Redis / Bull (job queue)
const Queue = require('bull');
const REDIS_URL = process.env.REDIS_URL;
const jobsQueue = REDIS_URL ? new Queue('jobs', REDIS_URL) : null;
if (jobsQueue) {
  jobsQueue.on('error', (err) => logger.error('Jobs queue error', err));
  jobsQueue.on('failed', (job, err) => logger.error('Job failed', { jobId: job.id, error: err }));
} else {
  logger.warn('REDIS_URL not set - job queue disabled');
}

// Initialize Redis cache (uses same REDIS_URL)
initCache(REDIS_URL);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // https://your-backend-domain
const WEB_APP_URL =
  process.env.WEB_APP_URL ||
  process.env.WEBAPP_URL ||
  process.env.FRONTEND_URL ||
  '';
const USE_WEBHOOK = Boolean(WEBHOOK_URL) && process.env.BOT_USE_WEBHOOK !== 'false';
console.log('Webhook config:', { WEBHOOK_URL, BOT_USE_WEBHOOK: process.env.BOT_USE_WEBHOOK, USE_WEBHOOK });
// Constants - Configuration values
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const DEV_SKIP_VERIFY = process.env.DEV_SKIP_VERIFY === 'true';
const AUTH_MAX_AGE_SECONDS = Number(process.env.AUTH_MAX_AGE_SECONDS || 300);
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 7 * 24 * 60 * 60);
const SESSION_CLEANUP_INTERVAL_SECONDS = Number(
  process.env.SESSION_CLEANUP_INTERVAL_SECONDS || 3600
);
const NOTIFY_INTERVAL_SECONDS = Number(process.env.NOTIFY_INTERVAL_SECONDS || 300);
const NOTIFY_UNLOCK_AHEAD_SECONDS = Number(process.env.NOTIFY_UNLOCK_AHEAD_SECONDS || 0);

// Rate Limiting Constants
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 300;
const RATE_LIMIT_VERIFY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_VERIFY_MAX = 30;
const RATE_LIMIT_LETTER_CREATE_MAX = 20; // per 15 minutes
const RATE_LIMIT_SEARCH_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const RATE_LIMIT_SEARCH_MAX = 30;
const RATE_LIMIT_DUEL_CREATE_MAX = 10; // per 15 minutes

if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in env');
  process.exit(1);
}

// Performance: Configure database connection pool
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  statement_timeout: 10000, // Query timeout (10 seconds)
}) : null;

// Import migrations
const { createTables } = require('./migrations');

const bot = new Telegraf(BOT_TOKEN);

const BOT_INFO_IMAGE_URL = process.env.BOT_INFO_IMAGE_URL || '';
const BOT_INFO_TEXT =
  'PRESS F — это мем‑сейф для твоих слов, споров и секретных нычек с криптокошельками.\n' +
  '• Письма с таймером и дедлайном\n' +
  '• Споры с хайп‑ставкой и публичной драмой\n' +
  '• Завещания и вечные хранилища (TON‑фичи)\n' +
  'Нажми НАЧАТЬ и заходи в WebApp.';

const buildStartKeyboard = () => ({
    reply_markup: {
    inline_keyboard: [[{ text: 'НАЧАТЬ', web_app: { url: WEB_APP_URL } }]]
  }
});

const sendStartMessage = async (ctx) => {
  try {
    logger.info('[/start] Received start command', { userId: ctx.from?.id, username: ctx.from?.username });
    
    if (!WEB_APP_URL) {
      logger.warn('[/start] WEB_APP_URL not set');
      return await ctx.reply('WebApp URL is not set. Define WEB_APP_URL in .env');
    }
    
    if (BOT_INFO_IMAGE_URL) {
      logger.debug('[/start] Attempting to send image', { imageUrl: BOT_INFO_IMAGE_URL });
      try {
        const result = await ctx.replyWithPhoto(
          { url: BOT_INFO_IMAGE_URL },
          { caption: BOT_INFO_TEXT, ...buildStartKeyboard() }
        );
        logger.info('[/start] Image sent successfully', { messageId: result?.message_id });
        return result;
      } catch (error) {
        logger.error('[/start] Failed to send bot info image', { error: error?.message || error, stack: error?.stack });
        logger.debug('[/start] Falling back to text message');
      }
    } else {
      logger.debug('[/start] BOT_INFO_IMAGE_URL not set, sending text only');
    }
    
    const result = await ctx.reply(BOT_INFO_TEXT, buildStartKeyboard());
    logger.info('[/start] Text message sent successfully', { messageId: result?.message_id });
    return result;
  } catch (error) {
    logger.error('[/start] Error in sendStartMessage', { error: error?.message || error, stack: error?.stack });
    try {
      return await ctx.reply('Произошла ошибка. Попробуйте позже.');
    } catch (replyError) {
      logger.error('[/start] Failed to send error message', { error: replyError?.message || replyError });
    }
  }
};

const sendWebAppButton = (ctx) => {
  if (!WEB_APP_URL) {
    return ctx.reply('WebApp URL is not set. Define WEB_APP_URL in .env');
  }
  return ctx.reply('Открыть WebApp', buildStartKeyboard());
};

// Error handling for bot commands
bot.catch((err, ctx) => {
  logger.error('Bot error', { 
    error: err?.message || err, 
    stack: err?.stack,
    updateType: ctx.updateType,
    userId: ctx.from?.id
  });
  
  // Try to send error message to user
  try {
    ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
  } catch (e) {
    logger.error('Failed to send error message to user', { error: e?.message });
  }
});

bot.start(sendStartMessage);
bot.command('open', sendWebAppButton);
bot.command('info', async (ctx) => {
  try {
    await ctx.reply(BOT_INFO_TEXT);
  } catch (error) {
    logger.error('Error in /info command', { error: error?.message || error });
  }
});

const app = express();

// Body size limit middleware (before express.json)
const bodySizeLimit = require('./middleware/bodySizeLimit');
app.use(bodySizeLimit);

// JSON parser with reasonable default limit
app.use(express.json({ limit: '1mb' }));

// Serve static files (for bot images, avatars, etc.) with caching
const path = require('path');
const staticPath = path.join(__dirname, 'static');
// Serve avatars from subdirectory
app.use('/api/static/avatars', express.static(path.join(staticPath, 'avatars'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jpg') || filePath.endsWith('.png') || filePath.endsWith('.gif') || filePath.endsWith('.webp')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
app.use('/api/static', express.static(staticPath, {
  maxAge: '1y', // Cache for 1 year
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Performance: Set explicit cache headers for static assets
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));
console.log('Static files served from:', staticPath);

// Telegram webhook callback (MUST be first, before any other middleware)
if (USE_WEBHOOK) {
  // Add a simple handler for HEAD/GET requests to /bot for debugging (BEFORE webhookCallback)
  app.head('/bot', (req, res) => {
    logger.debug('HEAD /bot received');
    res.status(200).end();
  });
  app.get('/bot', (req, res) => {
    logger.debug('GET /bot received');
    res.status(200).json({ ok: true, message: 'Webhook endpoint is active' });
  });
  
  // Error handling middleware for webhook
  app.use((err, req, res, next) => {
    if (req.path === '/bot') {
      // Security: Log full error details but don't expose to client
      logger.error('Webhook error', {
        error: err?.message || err,
        stack: err?.stack,
        path: req.path,
        method: req.method,
        body: req.body ? JSON.stringify(req.body).substring(0, 200) : null
      });
      // Telegram expects 200 even on errors, but log the actual error
      res.status(200).json({ ok: false, error: 'Internal error' });
      return;
    }
    next(err);
  });
  
  app.use(bot.webhookCallback('/bot', {
    secretToken: process.env.WEBHOOK_SECRET || undefined
  }));
  logger.info('✅ Webhook callback registered at /bot', { webhookUrl: WEBHOOK_URL });
} else {
  logger.warn('⚠️  Webhook callback NOT registered. USE_WEBHOOK=false');
}

// Performance: Add request performance monitoring
const performanceMonitor = require('./middleware/performanceMonitor');
app.use(performanceMonitor);

// Security: Configure Helmet with proper CSP for Telegram Mini App
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://telegram.org"], // Telegram Mini App needs unsafe-inline
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.telegram.org", "https://*.telegram.org"],
      fontSrc: ["'self'", "data:"],
      frameSrc: ["'self'", "https://telegram.org"]
    }
  },
  crossOriginEmbedderPolicy: false, // Required for Telegram Mini App
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Additional Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

const verifyLimiter = rateLimit({
  windowMs: RATE_LIMIT_VERIFY_WINDOW_MS,
  max: RATE_LIMIT_VERIFY_MAX,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/verify', verifyLimiter);

// Security: Rate limiting for critical endpoints
const letterCreateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_LETTER_CREATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many letters created, please try again later'
});

const searchLimiter = rateLimit({
  windowMs: RATE_LIMIT_SEARCH_WINDOW_MS,
  max: RATE_LIMIT_SEARCH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many search requests, please try again later'
});

const duelCreateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_DUEL_CREATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many duels created, please try again later'
});

// CORS middleware - Security: Whitelist only allowed origins
const allowedOrigins = [
  process.env.WEB_APP_URL,
  process.env.FRONTEND_URL,
  'https://pressfbot.ru',
  'https://www.pressfbot.ru'
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Import routes and middleware
const { createAuthMiddleware } = require('./middleware/auth');
const { createLettersRoutes } = require('./routes/letters');
const { createProfileRoutes } = require('./routes/profile');
const { createDuelsRoutes } = require('./routes/duels');
const { createLegacyRoutes } = require('./routes/legacy');
const { createNotificationsRoutes } = require('./routes/notifications');
const { createTonRoutes } = require('./routes/ton');
const { createDailyQuestsRoutes, generateDailyQuestsForAllUsers } = require('./routes/dailyQuests');
const { createAvatarsRoutes } = require('./routes/avatars');
const { createGiftsRoutes } = require('./routes/gifts');
const { createEventsRoutes } = require('./routes/events');
const { createTournamentsRoutes } = require('./routes/tournaments');
const { createActivityRoutes, logActivity } = require('./routes/activity');
const { normalizeLetter } = require('./services/lettersService');
const { normalizeDuel } = require('./services/duelsService');
const { normalizeLegacyItem } = require('./services/legacyService');

// Apply auth middleware
const authMiddleware = createAuthMiddleware(pool);

// Register API routes with rate limiting
// Note: Rate limiters for POST requests are applied inside route handlers
app.use('/api/letters', authMiddleware, createLettersRoutes(pool, letterCreateLimiter));
app.use('/api/profile', authMiddleware, createProfileRoutes(pool));
app.use('/api/duels', authMiddleware, createDuelsRoutes(pool, duelCreateLimiter));
app.use('/api/legacy', authMiddleware, createLegacyRoutes(pool));
app.use('/api/notifications', authMiddleware, createNotificationsRoutes(pool));
app.use('/api/ton', authMiddleware, createTonRoutes(pool));
app.use('/api/daily-quests', authMiddleware, createDailyQuestsRoutes(pool));
app.use('/api/avatars', createAvatarsRoutes()); // No auth needed for public avatars list
app.use('/api/gifts', authMiddleware, createGiftsRoutes(pool));
app.use('/api/events', authMiddleware, createEventsRoutes(pool));
app.use('/api/tournaments', authMiddleware, createTournamentsRoutes(pool));
app.use('/api/activity', authMiddleware, createActivityRoutes(pool));

// Global search across letters, duels, legacy (with rate limiting and pagination)
app.get('/api/search', searchLimiter, authMiddleware, async (req, res) => {
  try {
    if (!pool) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    const userId = req.userId;
    if (!userId) {
      return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
    }

    const q = String(req.query.q || '').trim();
    const limitRaw = req.query.limit;
    const offsetRaw = req.query.offset;
    const limit = limitRaw ? Number(limitRaw) : 10;
    const offset = offsetRaw ? Number(offsetRaw) : 0;

    if (q.length < 2) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Query is too short');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid limit', {
        field: 'limit',
        min: 1,
        max: 20
      });
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid offset', {
        field: 'offset',
        min: 0
      });
    }

    const like = `%${q}%`;

    const lettersResult = await pool.query(
      `SELECT * FROM letters
       WHERE user_id = $1
         AND (
           title ILIKE $2 OR content ILIKE $2 OR array_to_string(recipients, ' ') ILIKE $2
         )
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, like, limit, offset]
    );

    const duelsResult = await pool.query(
      `SELECT * FROM duels
       WHERE (challenger_id = $1 OR opponent_id = $1)
         AND (
           title ILIKE $2 OR stake ILIKE $2 OR opponent_name ILIKE $2
         )
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, like, limit, offset]
    );

    const legacyResult = await pool.query(
      `SELECT * FROM legacy_items
       WHERE user_id = $1
         AND (
           title ILIKE $2 OR description ILIKE $2
         )
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, like, limit, offset]
    );

    return res.json({
      ok: true,
      letters: lettersResult.rows.map(normalizeLetter),
      duels: duelsResult.rows.map(normalizeDuel),
      legacy: legacyResult.rows.map(normalizeLegacyItem),
      meta: {
        q,
        limit,
        offset,
        total: lettersResult.rows.length + duelsResult.rows.length + legacyResult.rows.length
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    return sendError(res, 500, 'SEARCH_FAILED', 'Failed to search');
  }
});

// Enhanced Health check with metrics (no auth)
app.get('/api/health', async (_req, res) => {
  const health = {
    ok: true,
    timestamp: Date.now(),
    uptime: process.uptime(),
    db: 'unknown',
    redis: 'unknown',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  };

  // Check database
  if (!pool) {
    health.db = 'disabled';
  } else {
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      const queryTime = Date.now() - start;
      health.db = 'ok';
      health.dbQueryTime = queryTime;
    } catch (e) {
      health.ok = false;
      health.db = 'error';
      health.dbError = e.message;
    }
  }

  // Check Redis (if available)
  if (jobsQueue) {
    try {
      const client = jobsQueue.client;
      await client.ping();
      health.redis = 'ok';
    } catch (e) {
      health.redis = 'error';
      health.redisError = e.message;
    }
  } else {
    health.redis = 'disabled';
  }

  const statusCode = health.ok ? 200 : 503;
  return res.status(statusCode).json(health);
});

// Create all tables (sessions + migrations)
(async () => {
  if (!pool) {
    console.warn('⚠️  No database connection - running in local storage mode');
    return;
  }
  try {
    // Sessions table first
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        telegram_id BIGINT,
        init_data TEXT,
        expires_at TIMESTAMP,
        last_seen_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
    await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP`);
    await pool.query(
      `UPDATE sessions SET expires_at = now() + ($1 * interval '1 second') WHERE expires_at IS NULL`,
      [SESSION_TTL_SECONDS]
    );
    await pool.query(
      `UPDATE sessions SET last_seen_at = COALESCE(last_seen_at, created_at) WHERE last_seen_at IS NULL`
    );
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);
    // Performance: Index for telegram_id lookups in auth middleware
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_telegram_id ON sessions(telegram_id)`);
    logger.info('Sessions table initialized');

    if (SESSION_CLEANUP_INTERVAL_SECONDS > 0) {
      const interval = setInterval(async () => {
        try {
          const result = await pool.query(
            'DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= now()'
          );
            if (result.rowCount > 0) {
              logger.info(`Cleaned up ${result.rowCount} expired sessions`);
            }
        } catch (cleanupError) {
          logger.warn('Failed to clean up expired sessions', { error: cleanupError.message });
        }
      }, SESSION_CLEANUP_INTERVAL_SECONDS * 1000);
      if (interval.unref) {
        interval.unref();
      }
    }

    if (NOTIFY_INTERVAL_SECONDS > 0) {
      const runNotifications = async () => {
        try {
          // Letters unlock notifications
          const lettersResult = await pool.query(
            `SELECT id, user_id, title, unlock_date
             FROM letters
             WHERE status = 'scheduled'
               AND unlock_date IS NOT NULL
               AND unlock_date <= (now() + ($1 * interval '1 second'))
               AND unlock_notified_at IS NULL
               AND EXISTS (
                 SELECT 1 FROM user_settings
                 WHERE user_settings.user_id = letters.user_id
                   AND notifications_enabled = true
                   AND telegram_notifications_enabled = true
               )
             LIMIT 50`,
            [NOTIFY_UNLOCK_AHEAD_SECONDS]
          );

          for (const row of lettersResult.rows) {
            try {
              const msg = `Your letter "${row.title}" is now unlocked.`;
              await bot.telegram.sendMessage(row.user_id.toString(), msg);
              await pool.query(
                `UPDATE letters
                 SET unlock_notified_at = now(), status = 'sent', updated_at = now()
                 WHERE id = $1`,
                [row.id]
              );
              await pool.query(
                `INSERT INTO notification_events (id, user_id, event_type, title, message)
                 VALUES ($1, $2, $3, $4, $5)`,
                [uuidv4(), row.user_id, 'unlock', row.title, msg]
              );
            } catch (notifyError) {
              logger.warn('Failed to notify unlock', { letterId: row.id, userId: row.user_id, error: notifyError.message });
            }
          }

          // Check-in reminders
          const checkinResult = await pool.query(
            `SELECT user_id, dead_man_switch_days, last_check_in, checkin_notified_at, checkin_reminder_interval_minutes
             FROM user_settings
             WHERE notifications_enabled = true
               AND telegram_notifications_enabled = true
               AND last_check_in + (dead_man_switch_days || ' days')::interval <= now()
               AND (
                 checkin_notified_at IS NULL
                 OR checkin_notified_at <= now() - (COALESCE(checkin_reminder_interval_minutes, 60) || ' minutes')::interval
               )
             LIMIT 50`
          );

          for (const row of checkinResult.rows) {
            try {
              const msg = `Reminder: please check-in to keep your timer alive.`;
              await bot.telegram.sendMessage(row.user_id.toString(), msg);
              await pool.query(
                `UPDATE user_settings SET checkin_notified_at = now() WHERE user_id = $1`,
                [row.user_id]
              );
              await pool.query(
                `INSERT INTO notification_events (id, user_id, event_type, title, message)
                 VALUES ($1, $2, $3, $4, $5)`,
                [uuidv4(), row.user_id, 'checkin', 'Check-in reminder', msg]
              );
            } catch (notifyError) {
              logger.warn('Failed to notify check-in', { userId: row.user_id, error: notifyError.message });
            }
          }
        } catch (notifyError) {
          logger.error('Notification job failed', notifyError);
        }
      };

      const notifyInterval = setInterval(runNotifications, NOTIFY_INTERVAL_SECONDS * 1000);
      if (notifyInterval.unref) {
        notifyInterval.unref();
      }
      runNotifications();
    }

    // Daily quests generation job - runs at 00:00 UTC every day
    const scheduleDailyQuestsGeneration = () => {
      const now = new Date();
      const utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
      const utcMidnight = new Date(utcNow);
      utcMidnight.setUTCHours(0, 0, 0, 0);
      
      // If it's already past midnight today, schedule for tomorrow
      if (utcNow >= utcMidnight) {
        utcMidnight.setUTCDate(utcMidnight.getUTCDate() + 1);
      }

      const msUntilMidnight = utcMidnight.getTime() - utcNow.getTime();
      
      logger.info(`Scheduling daily quests generation for ${utcMidnight.toISOString()} (in ${Math.round(msUntilMidnight / 1000 / 60)} minutes)`);

      // Schedule first run
      setTimeout(async () => {
        try {
          await generateDailyQuestsForAllUsers(pool);
        } catch (error) {
          logger.error('Failed to generate daily quests', { error: error.message });
        }

        // Then run every 24 hours
        const dailyInterval = setInterval(async () => {
          try {
            await generateDailyQuestsForAllUsers(pool);
          } catch (error) {
            logger.error('Failed to generate daily quests', { error: error.message });
          }
        }, 24 * 60 * 60 * 1000); // 24 hours

        if (dailyInterval.unref) {
          dailyInterval.unref();
        }
      }, msUntilMidnight);
    };

    scheduleDailyQuestsGeneration();
    
    // Run all migrations
    await createTables(pool);
    logger.info('Database initialized successfully');
  } catch (e) {
    logger.error('Failed to initialize database', e);
  }
})();

// /api/verify expects { initData: "key=val&...&hash=..." }
// on success creates session record and returns sessionId
app.post('/api/verify', async (req, res) => {
  const initData = req.body?.initData;
  if (!initData) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'initData required');
  }

  let ok = false;
  if (DEV_SKIP_VERIFY) {
    ok = true;
  } else {
    ok = verifyInitData(initData, BOT_TOKEN);
  }

  if (!ok) {
    return sendError(res, 401, 'AUTH_INVALID', 'invalid signature');
  }

  if (!DEV_SKIP_VERIFY) {
    const params = new URLSearchParams(initData);
    const authDateRaw = params.get('auth_date');
    const authDate = authDateRaw ? Number(authDateRaw) : NaN;
    if (!authDateRaw || !Number.isFinite(authDate)) {
      return sendError(res, 401, 'AUTH_DATE_INVALID', 'auth_date is missing or invalid');
    }
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds < 0 || ageSeconds > AUTH_MAX_AGE_SECONDS) {
      return sendError(res, 401, 'AUTH_DATE_EXPIRED', 'auth_date is expired');
    }
  }

  // parse telegram user id from initData
  const params = new URLSearchParams(initData);
  let tgUserId = null;
  try {
    for (const [k, v] of params.entries()) {
      if (k === 'user' || k === 'initDataUnsafe') {
        try {
          const parsed = JSON.parse(v);
          if (parsed?.id) tgUserId = parsed.id;
        } catch (e) {}
      }
    }
    if (!tgUserId) {
      const raw = req.body?.initData;
      const m = raw.match(/user=(\{.*\})/);
      if (m) {
        try {
          const parsed = JSON.parse(decodeURIComponent(m[1]));
          if (parsed?.id) tgUserId = parsed.id;
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn('Failed to parse user id from initData', e);
  }

  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  try {
    if (pool) {
      // Security: Do not store init_data (contains sensitive user data)
      // Only store telegram_id for session management
      await pool.query(
        'INSERT INTO sessions(id, telegram_id, expires_at, last_seen_at) VALUES($1, $2, $3, now())',
        [sessionId, tgUserId, expiresAt]
      );

      // Handle referral code from start_param
      const startParam = params.get('start_param');
      if (startParam && startParam.startsWith('ref_')) {
        const referralCode = startParam.replace('ref_', '');
        try {
          // Find referrer by referral code
          const referrerResult = await pool.query(
            'SELECT user_id FROM profiles WHERE referral_code = $1',
            [referralCode]
          );

          if (referrerResult.rowCount > 0 && referrerResult.rows[0].user_id !== tgUserId) {
            const referrerId = referrerResult.rows[0].user_id;

            // Check if user already exists
            const userProfile = await pool.query(
              'SELECT user_id, referred_by FROM profiles WHERE user_id = $1',
              [tgUserId]
            );

            // Only process referral if user is new (no profile) or not already referred
            if (userProfile.rowCount === 0 || !userProfile.rows[0].referred_by) {
              // Create or update profile with referral
              await pool.query(
                `INSERT INTO profiles (user_id, referred_by, created_at, updated_at)
                 VALUES ($1, $2, now(), now())
                 ON CONFLICT (user_id) DO UPDATE SET referred_by = EXCLUDED.referred_by WHERE profiles.referred_by IS NULL`,
                [tgUserId, referrerId]
              );

              // Security: Check for duplicate referral event before creating
              const existingEvent = await pool.query(
                'SELECT id FROM referral_events WHERE referrer_id = $1 AND referred_id = $2',
                [referrerId, tgUserId]
              );
              
              if (existingEvent.rowCount === 0) {
                // Create referral event only if it doesn't exist
                await pool.query(
                  `INSERT INTO referral_events (id, referrer_id, referred_id, reward_given, created_at)
                   VALUES ($1, $2, $3, false, now())`,
                  [uuidv4(), referrerId, tgUserId]
                );
              } else {
                logger.debug('Referral event already exists', { referrerId, referredId: tgUserId });
              }

              // Update referrer's referrals count
              await pool.query(
                'UPDATE profiles SET referrals_count = referrals_count + 1 WHERE user_id = $1',
                [referrerId]
              );

              // Award XP to referrer (100 XP for inviting friend)
              const { getXPReward } = require('./utils/xpSystem');
              const xpReward = getXPReward('invite_friend');
              if (xpReward > 0) {
                await pool.query(
                  `UPDATE profiles 
                   SET experience = experience + $1, total_xp_earned = total_xp_earned + $1, updated_at = now()
                   WHERE user_id = $2`,
                  [xpReward, referrerId]
                );
              }

              logger.info('Referral processed', { referrerId, referredId: tgUserId, referralCode });
            }
          }
        } catch (refError) {
          logger.warn('Failed to process referral', { error: refError.message, referralCode });
          // Don't fail the session creation if referral processing fails
        }
      }

      // Generate referral code for new user if doesn't exist
      if (tgUserId) {
        const userProfile = await pool.query(
          'SELECT referral_code FROM profiles WHERE user_id = $1',
          [tgUserId]
        );

        if (userProfile.rowCount === 0 || !userProfile.rows[0].referral_code) {
          // Security: Use cryptographically secure random generator for referral codes
          const crypto = require('crypto');
          let referralCode = '';
          let attempts = 0;
          while (attempts < 10) {
            // Generate 8-character code using crypto.randomBytes (more secure than Math.random)
            referralCode = crypto.randomBytes(4).toString('hex').toUpperCase().substring(0, 8);
            const existing = await pool.query(
              'SELECT user_id FROM profiles WHERE referral_code = $1',
              [referralCode]
            );
            if (existing.rowCount === 0) break;
            attempts++;
          }

          if (referralCode) {
            await pool.query(
              `INSERT INTO profiles (user_id, referral_code, created_at, updated_at)
               VALUES ($1, $2, now(), now())
               ON CONFLICT (user_id) DO UPDATE SET referral_code = EXCLUDED.referral_code WHERE profiles.referral_code IS NULL`,
              [tgUserId, referralCode]
            );
          }
        }
      }
    }
    return res.json({ ok: true, sessionId });
  } catch (e) {
    logger.error('Failed to create session', e);
    return sendError(res, 500, 'SESSION_CREATE_FAILED', 'Failed to create session');
  }
});

// Temporary endpoint to enqueue a test job into Bull
// POST /api/enqueue-test { chatId: number, text?: string, token?: string }
app.post('/api/enqueue-test', async (req, res) => {
  if (!jobsQueue) {
    return res.status(503).json({ ok: false, error: 'queue disabled' });
  }
  const { chatId, text, token } = req.body || {};
  if (!chatId) return res.status(400).json({ ok: false, error: 'chatId required' });

  const jobData = {
    type: 'send_message',
    chatId,
    text: text || 'Test message from Press F worker',
    token: token || BOT_TOKEN
  };

  try {
    const job = await jobsQueue.add(jobData);
    return res.json({ ok: true, jobId: job.id });
  } catch (e) {
    console.error('Failed to enqueue job', e);
    return res.status(500).json({ ok: false });
  }
});

// endpoint to get session info (security: removed init_data to prevent data leakage)
app.get('/api/session/:id', async (req, res) => {
  const id = req.params.id;
  try {
    if (!pool) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }
    // Security: Do not return init_data (contains sensitive user data)
    const r = await pool.query('SELECT id, telegram_id, created_at, expires_at, last_seen_at FROM sessions WHERE id=$1', [id]);
    if (r.rowCount === 0) {
      return sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
    }
    return res.json({ ok: true, session: r.rows[0] });
  } catch (e) {
    logger.error('Failed to fetch session', e);
    return sendError(res, 500, 'SESSION_FETCH_FAILED', 'Failed to fetch session');
  }
});

// Use webhook if WEBHOOK_URL provided, otherwise fall back to long polling
(async () => {
  try {
    if (USE_WEBHOOK) {
      const webhookUrl = `${WEBHOOK_URL}/bot`;
      await bot.telegram.setWebhook(webhookUrl, {
        secret_token: process.env.WEBHOOK_SECRET || undefined
      });
      logger.info('✅ Webhook set successfully', { webhookUrl });
      
      // Verify webhook
      const webhookInfo = await bot.telegram.getWebhookInfo();
      logger.info('Webhook info', { 
        url: webhookInfo.url, 
        pendingUpdateCount: webhookInfo.pending_update_count,
        lastErrorDate: webhookInfo.last_error_date,
        lastErrorMessage: webhookInfo.last_error_message
      });
      
      if (webhookInfo.last_error_message) {
        logger.warn('Webhook has errors', { 
          lastErrorDate: webhookInfo.last_error_date,
          lastErrorMessage: webhookInfo.last_error_message
        });
      }
    } else {
      // Delete webhook if exists
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        logger.info('Webhook deleted, using long polling');
      } catch (deleteError) {
        logger.debug('No webhook to delete or error deleting', { error: deleteError?.message });
      }
      
      await bot.launch();
      logger.info('✅ Bot launched via long polling');
      
      // Graceful shutdown
      process.once('SIGINT', () => bot.stop('SIGINT'));
      process.once('SIGTERM', () => bot.stop('SIGTERM'));
    }
  } catch (e) {
    logger.error('❌ Failed to set webhook or launch bot', { 
      error: e?.message || e, 
      stack: e?.stack,
      useWebhook: USE_WEBHOOK,
      webhookUrl: WEBHOOK_URL
    });
  }
})();

app.listen(PORT, () => logger.info(`Backend running on port ${PORT}`));

function verifyInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;

    const entries = [];
    for (const [k, v] of params.entries()) {
      if (k === 'hash') continue;
      entries.push([k, v]);
    }
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(e => `${e[0]}=${e[1]}`).join('\n');

    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return hmac === hash.toLowerCase();
  } catch (e) {
    console.error('verifyInitData error', e);
    return false;
  }
}
