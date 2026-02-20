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

// Invalidate avatars cache on startup so new avatar files (e.g. pressf.svg) are picked up after deploy
cache.del('avatars:list').catch(() => {});

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // https://your-backend-domain
const WEB_APP_URL = (
  process.env.WEB_APP_URL ||
  process.env.WEBAPP_URL ||
  process.env.FRONTEND_URL ||
  ''
).trim();
const USE_WEBHOOK = Boolean(WEBHOOK_URL) && process.env.BOT_USE_WEBHOOK !== 'false';
logger.info('Webhook config:', { WEBHOOK_URL, BOT_USE_WEBHOOK: process.env.BOT_USE_WEBHOOK, USE_WEBHOOK });
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

// Rate Limiting Constants (env overrides for Docker/proxy where many users share one IP)
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 1200; // global per window (was 300; increase if 429 under load)
const RATE_LIMIT_GET_WINDOW_MS = 15 * 60 * 1000; // 15 minutes for GET requests
const RATE_LIMIT_GET_MAX = Number(process.env.RATE_LIMIT_GET_MAX) || 800; // GET per window (per session or IP; was 400)
const RATE_LIMIT_POST_WINDOW_MS = 15 * 60 * 1000; // 15 minutes for POST requests
const RATE_LIMIT_POST_MAX = 50; // 50 POST requests per window
const RATE_LIMIT_VERIFY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_VERIFY_MAX = 30;
const RATE_LIMIT_LETTER_CREATE_MAX = 20; // per 15 minutes
const RATE_LIMIT_SEARCH_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const RATE_LIMIT_SEARCH_MAX = 30;
const RATE_LIMIT_DUEL_CREATE_MAX = 10; // per 15 minutes

if (!BOT_TOKEN) {
  logger.error('Missing TELEGRAM_BOT_TOKEN in env');
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

// Trust proxy (required when behind reverse proxy: Traefik, nginx, etc.) so req.ip and X-Forwarded-* are correct; avoids express-rate-limit ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// Body size limit middleware (before express.json)
const bodySizeLimit = require('./middleware/bodySizeLimit');
app.use(bodySizeLimit);

// JSON parser with reasonable default limit
app.use(express.json({ limit: '1mb' }));

// Serve static files (for bot images, avatars, etc.) with caching
const path = require('path');
const staticPath = path.join(__dirname, 'static');
// Serve avatars from subdirectory
// Image optimization middleware - serve WebP when available
app.use('/api/static/avatars', (req, res, next) => {
  // Check if client supports WebP
  const acceptsWebP = req.headers.accept && req.headers.accept.includes('image/webp');
  const originalPath = req.path;
  
  // If WebP is supported and file is not already WebP, try to serve WebP version
  if (acceptsWebP && !originalPath.endsWith('.webp')) {
    const webpPath = originalPath.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    const fs = require('fs');
    const webpFullPath = path.join(staticPath, 'avatars', webpPath);
    
    // Check if WebP version exists
    if (fs.existsSync(webpFullPath)) {
      req.url = webpPath;
    }
  }
  
  next();
}, express.static(path.join(staticPath, 'avatars'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jpg') || filePath.endsWith('.png') || filePath.endsWith('.gif') || filePath.endsWith('.webp')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      // Add Vary header for content negotiation
      res.setHeader('Vary', 'Accept');
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
// Also serve /static for Traefik routing (routes /static to backend)
app.use('/static', express.static(staticPath, {
  maxAge: '1y',
  etag: true,
  lastModified: true
}));
logger.info('Static files served from:', { path: staticPath });

// Register bot commands BEFORE webhook setup
bot.start(sendStartMessage);
bot.command('start', sendStartMessage);
bot.command('help', sendStartMessage);

// ─── Telegram Stars Payment Handlers ─────────────────
// Pre-checkout query: MUST answer within 10 seconds
bot.on('pre_checkout_query', async (ctx) => {
  try {
    logger.info('Pre-checkout query received', { 
      id: ctx.preCheckoutQuery.id,
      from: ctx.preCheckoutQuery.from?.id,
      totalAmount: ctx.preCheckoutQuery.total_amount 
    });
    // Always approve (validation happens in processStarsPayment)
    await ctx.answerPreCheckoutQuery(true);
  } catch (error) {
    logger.error('Pre-checkout query error:', error);
    try {
      await ctx.answerPreCheckoutQuery(false, 'Payment processing error. Please try again.');
    } catch (e) {}
  }
});

// Successful payment: process and deliver the item
bot.on('message', async (ctx, next) => {
  if (ctx.message?.successful_payment) {
    const payment = ctx.message.successful_payment;
    const userId = ctx.from?.id;
    
    logger.info('Successful Stars payment', {
      userId,
      totalAmount: payment.total_amount,
      currency: payment.currency,
      payload: payment.invoice_payload
    });

    try {
      await processStarsPayment(pool, bot, {
        userId,
        payload: payment.invoice_payload,
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        providerPaymentChargeId: payment.provider_payment_charge_id
      });

      await ctx.reply('✅ Payment successful! Your purchase has been activated.');
    } catch (error) {
      logger.error('Payment processing error:', error);
      await ctx.reply('⚠️ Payment received but activation failed. Contact support.');
    }
    return;
  }
  return next();
});

// Telegram webhook callback (MUST be first, before any other middleware)
if (USE_WEBHOOK) {
  // Log incoming webhook POSTs so we can see if Telegram reaches the backend
  app.use('/bot', (req, res, next) => {
    if (req.method === 'POST') {
      logger.info('[/bot] Webhook update received', { updateId: req.body?.update_id });
    }
    next();
  });

  // Add a simple handler for HEAD/GET requests to /bot for debugging (BEFORE webhookCallback)
  app.head('/bot', (req, res) => {
    logger.debug('HEAD /bot received');
    res.status(200).end();
  });
  app.get('/bot', (req, res) => {
    logger.debug('GET /bot received');
    res.status(200).json({ ok: true, message: 'Webhook endpoint is active' });
  });
  
  // Register webhook callback - bot.webhookCallback handles POST /bot
  // Note: webhookCallback must be registered AFTER express.json() middleware (line 183)
  // bot.webhookCallback('/bot') returns middleware that handles POST requests to /bot
  app.use(bot.webhookCallback('/bot', {
    secretToken: process.env.WEBHOOK_SECRET || undefined
  }));
  
  // Error handling middleware for webhook (AFTER webhookCallback)
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
  logger.info('✅ Webhook callback registered at /bot', { webhookUrl: WEBHOOK_URL });
} else {
  logger.warn('⚠️  Webhook callback NOT registered. USE_WEBHOOK=false');
}

// Performance: Add request performance monitoring
const performanceMonitor = require('./middleware/performanceMonitor');
app.use(performanceMonitor);

// Security: Add security logging middleware (skip for /bot webhook)
const { securityLoggerMiddleware } = require('./middleware/securityLogger');
app.use((req, res, next) => {
  // Skip security logging for webhook endpoint to avoid interference
  if (req.path === '/bot') {
    return next();
  }
  return securityLoggerMiddleware(req, res, next);
});

// Monitoring: Add basic monitoring middleware (skip for /bot webhook)
const { monitoringMiddleware, getMetrics, getPrometheusMetrics, updateHealthStatus, trackBusiness } = require('./middleware/monitoring');
app.use((req, res, next) => {
  // Skip monitoring for webhook endpoint to avoid interference
  if (req.path === '/bot') {
    return next();
  }
  return monitoringMiddleware(req, res, next);
});

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
  
  // Security: HSTS (Strict-Transport-Security) - force HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
});

// Security: Redirect HTTP to HTTPS (if behind proxy)
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.get('x-session-id') || req.ip || 'anonymous'
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

// Rate limiters for general GET and POST requests (key by session when present so one IP can have many users)
const getLimiter = rateLimit({
  windowMs: RATE_LIMIT_GET_WINDOW_MS,
  max: RATE_LIMIT_GET_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later',
  keyGenerator: (req) => req.get('x-session-id') || req.ip || 'anonymous'
});

const postLimiter = rateLimit({
  windowMs: RATE_LIMIT_POST_WINDOW_MS,
  max: RATE_LIMIT_POST_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later'
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
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { createLettersRoutes } = require('./routes/letters');
const { createProfileRoutes } = require('./routes/profile');
const { createDuelsRoutes } = require('./routes/duels');
const { createChallengesRoutes } = require('./routes/challenges');
const { createLegacyRoutes } = require('./routes/legacy');
const { createNotificationsRoutes } = require('./routes/notifications');
const { createTonRoutes } = require('./routes/ton');
const { createDailyQuestsRoutes, generateDailyQuestsForAllUsers } = require('./routes/dailyQuests');
const { createAvatarsRoutes } = require('./routes/avatars');
const { createGiftsRoutes } = require('./routes/gifts');
const { createEventsRoutes } = require('./routes/events');
const { createTournamentsRoutes } = require('./routes/tournaments');
const { createActivityRoutes, logActivity } = require('./routes/activity');
const { createFriendsRoutes } = require('./routes/friends');
const { createSquadsRoutes } = require('./routes/squads');
const { createWitnessesRoutes } = require('./routes/witnesses');
const { createFriendsRoutes } = require('./routes/friends');
const { createStarsRoutes, handleStarsCatalog, processStarsPayment } = require('./routes/stars');
const { createStoreRoutes, handleStoreCatalog } = require('./routes/store');
const { createLimitCheck, createLimitsRoute } = require('./middleware/freeTier');
const { normalizeLetter } = require('./services/lettersService');
const { normalizeDuel } = require('./services/duelsService');
const { normalizeLegacyItem } = require('./services/legacyService');

// Apply auth middleware
const authMiddleware = createAuthMiddleware(pool);

// Free-tier limit checks (premium users bypass)
const letterLimitCheck = createLimitCheck(pool, 'letters', 'letters');
const duelLimitCheck = createLimitCheck(pool, 'duels', 'duels');
const giftLimitCheck = createLimitCheck(pool, 'gifts', 'gifts', 'sender_id');

// Register API routes with rate limiting
app.use('/api/letters', authMiddleware, getLimiter, createLettersRoutes(pool, letterCreateLimiter, letterLimitCheck));
app.use('/api/profile', authMiddleware, getLimiter, createProfileRoutes(pool, bot));
app.use('/api/duels', authMiddleware, getLimiter, createDuelsRoutes(pool, duelCreateLimiter, duelLimitCheck));
app.use('/api/legacy', authMiddleware, getLimiter, createLegacyRoutes(pool));
app.use('/api/notifications', authMiddleware, getLimiter, createNotificationsRoutes(pool, bot));
app.use('/api/ton', authMiddleware, getLimiter, createTonRoutes(pool));
app.use('/api/daily-quests', authMiddleware, getLimiter, createDailyQuestsRoutes(pool, bot));
app.use('/api/avatars', getLimiter, createAvatarsRoutes()); // No auth needed for public avatars list
// Public catalogs — no auth (static vitrine data; fixes empty Store when session not ready)
app.get('/api/store/catalog', getLimiter, handleStoreCatalog);
app.get('/api/stars/catalog', getLimiter, handleStarsCatalog);
app.use('/api/gifts', authMiddleware, getLimiter, createGiftsRoutes(pool, giftLimitCheck));
app.use('/api/events', authMiddleware, getLimiter, createEventsRoutes(pool));
app.use('/api/tournaments', authMiddleware, getLimiter, createTournamentsRoutes(pool));
app.use('/api/activity', authMiddleware, getLimiter, createActivityRoutes(pool));
app.use('/api/friends', authMiddleware, getLimiter, createFriendsRoutes(pool));
app.use('/api/challenges', authMiddleware, getLimiter, createChallengesRoutes(pool, bot));
app.use('/api/squads', authMiddleware, getLimiter, createSquadsRoutes(pool));
app.use('/api/witnesses', authMiddleware, getLimiter, createWitnessesRoutes(pool));
// Monetization routes
app.use('/api/stars', authMiddleware, getLimiter, createStarsRoutes(pool, bot));
app.use('/api/store', authMiddleware, getLimiter, createStoreRoutes(pool));
app.get('/api/limits', authMiddleware, getLimiter, createLimitsRoute(pool));
app.post('/api/analytics', getLimiter, async (req, res) => {
  try {
    const { event, userId: bodyUserId, properties } = req.body || {};
    if (!event || typeof event !== 'string') {
      return res.status(204).end();
    }
    const userId = bodyUserId != null ? Number(bodyUserId) : null;
    const props = properties && typeof properties === 'object' ? properties : {};
    if (pool) {
      await pool.query(
        `INSERT INTO analytics_events (user_id, event, properties) VALUES ($1, $2, $3)`,
        [userId || null, event.substring(0, 100), JSON.stringify(props)]
      );
    }
  } catch (err) {
    logger.debug('Analytics save failed', { error: err?.message });
  }
  res.status(204).end();
});

// GET /api/analytics/dashboard — базовые метрики по событиям (для PM/разработчика)
app.get('/api/analytics/dashboard', getLimiter, authMiddleware, async (req, res) => {
  try {
    if (!pool) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }
    const since = req.query.since || '24h'; // 24h | 7d
    const hours = since === '7d' ? 24 * 7 : 24;

    const countsResult = await pool.query(
      `SELECT event, COUNT(*) as count
       FROM analytics_events
       WHERE created_at > now() - ($1::text || ' hours')::interval
       GROUP BY event
       ORDER BY count DESC`,
      [String(hours)]
    );
    const eventsByType = {};
    countsResult.rows.forEach((row) => {
      eventsByType[row.event] = parseInt(row.count, 10);
    });

    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM analytics_events WHERE created_at > now() - ($1::text || ' hours')::interval`,
      [String(hours)]
    );
    const uniqueResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as uniq
       FROM analytics_events
       WHERE created_at > now() - ($1::text || ' hours')::interval AND user_id IS NOT NULL`,
      [String(hours)]
    );

    return res.json({
      ok: true,
      period: since,
      periodHours: hours,
      totalEvents: parseInt(totalResult.rows[0]?.total || '0', 10),
      uniqueUsers: parseInt(uniqueResult.rows[0]?.uniq || '0', 10),
      eventsByType
    });
  } catch (err) {
    logger.error('Analytics dashboard error', { error: err?.message });
    return sendError(res, 500, 'DASHBOARD_FAILED', 'Failed to load analytics');
  }
});

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
    logger.error('Search error:', { error: error?.message || error, query: req.query.q });
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

  // Update health status in monitoring
  updateHealthStatus(health.ok ? 'healthy' : (health.db === 'error' ? 'unhealthy' : 'degraded'));
  
  const statusCode = health.ok ? 200 : 503;
  return res.status(statusCode).json(health);
});

// JSON metrics endpoint (rate limited)
app.get('/api/metrics', globalLimiter, (req, res) => {
  try {
    const metrics = getMetrics();
    return res.json({ ok: true, metrics });
  } catch (error) {
    logger.error('Get metrics error:', error);
    return sendError(res, 500, 'METRICS_FETCH_FAILED', 'Failed to fetch metrics');
  }
});

// Prometheus-compatible metrics endpoint (for Grafana/Prometheus scraping)
app.get('/api/metrics/prometheus', globalLimiter, (req, res) => {
  try {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.send(getPrometheusMetrics());
  } catch (error) {
    logger.error('Prometheus metrics error:', error);
    return res.status(500).send('# Error generating metrics\n');
  }
});

// Create all tables (sessions + migrations)
(async () => {
  if (!pool) {
    logger.warn('No database connection - running in local storage mode');
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

          // Streak at risk — urgent notification when streak will be lost
          const streakRiskResult = await pool.query(
            `SELECT us.user_id, us.current_streak
             FROM user_settings us
             WHERE us.notifications_enabled = true
               AND us.telegram_notifications_enabled = true
               AND us.current_streak >= 3
               AND us.last_streak_date = (CURRENT_DATE - INTERVAL '1 day')::date
               AND NOT EXISTS (
                 SELECT 1 FROM notification_events ne
                 WHERE ne.user_id = us.user_id
                   AND ne.event_type = 'streak_risk'
                   AND ne.created_at > now() - INTERVAL '12 hours'
               )
             LIMIT 30`
          );

          for (const row of streakRiskResult.rows) {
            try {
              const msg = `⚠️ <b>Days in a row at risk!</b>\n\nYour ${row.current_streak} days in a row will reset if you don't check in today. Tap the skull now! 🔥`;
              await bot.telegram.sendMessage(row.user_id.toString(), msg, { parse_mode: 'HTML' });
              await pool.query(
                `INSERT INTO notification_events (id, user_id, event_type, title, message)
                 VALUES ($1, $2, $3, $4, $5)`,
                [uuidv4(), row.user_id, 'streak_risk', 'Days in a row at risk', msg]
              );
            } catch (notifyError) {
              logger.warn('Failed to notify streak risk', { userId: row.user_id, error: notifyError.message });
            }
          }

          // Check-in reminders (timer expired)
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
    // Security: Log failed initData verification attempts
    logger.warn('Security: Failed initData verification', {
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      hasInitData: !!initData,
      initDataLength: initData?.length || 0
    });
    return sendError(res, 401, 'AUTH_INVALID', 'invalid signature');
  }

  if (!DEV_SKIP_VERIFY) {
    const params = new URLSearchParams(initData);
    const authDateRaw = params.get('auth_date');
    const authDate = authDateRaw ? Number(authDateRaw) : NaN;
    if (!authDateRaw || !Number.isFinite(authDate)) {
      return sendError(res, 401, 'AUTH_DATE_INVALID', 'auth_date is missing or invalid');
    }
    const { logSecurityEvent, SECURITY_EVENTS } = require('./middleware/securityLogger');
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    
    if (ageSeconds < 0) {
      // Security: Log suspicious future-dated auth_date (possible replay attack)
      logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
        reason: 'future_dated_auth_date',
        authDate,
        currentTime: Math.floor(Date.now() / 1000),
        ageSeconds,
        ip
      });
      return sendError(res, 401, 'AUTH_DATE_INVALID', 'auth_date is in the future');
    }
    if (ageSeconds > AUTH_MAX_AGE_SECONDS) {
      // Security: Log expired auth_date attempts
      logSecurityEvent(SECURITY_EVENTS.FAILED_AUTH, {
        reason: 'expired_auth_date',
        authDate,
        ageSeconds,
        maxAge: AUTH_MAX_AGE_SECONDS,
        ip
      });
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
    logger.warn('Failed to parse user id from initData', e);
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

      // Handle referral code and squad invite from start_param
      const startParam = params.get('start_param');
      
      // Handle squad invite (squad_<squadId>)
      if (startParam && startParam.startsWith('squad_')) {
        const squadId = startParam.replace('squad_', '');
        // Frontend will handle joining via POST /api/squads/:id/join
        logger.debug('Squad invite detected', { squadId, userId: tgUserId });
      }
      
      // Handle witness invite (witness_<witnessId>)
      if (startParam && startParam.startsWith('witness_')) {
        const witnessId = startParam.replace('witness_', '');
        // Frontend will handle confirmation via POST /api/witnesses/:id/confirm
        logger.debug('Witness invite detected', { witnessId, userId: tgUserId });
      }
      
      // Handle referral code (ref_<code>)
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

              // Award XP and REP to referrer (увеличенные награды для виральности)
              const { getXPReward } = require('./utils/xpSystem');
              const xpReward = getXPReward('invite_friend'); // 200 XP
              const repReward = 50; // 50 REP за каждого реферала
              
              if (xpReward > 0) {
                await pool.query(
                  `UPDATE profiles 
                   SET experience = experience + $1, 
                       total_xp_earned = total_xp_earned + $1, 
                       spendable_xp = COALESCE(spendable_xp, 0) + $1,
                       reputation = COALESCE(reputation, 0) + $3,
                       updated_at = now()
                   WHERE user_id = $2`,
                  [xpReward, referrerId, repReward]
                );
              }
              
              // Check and award milestone rewards
              const referralsCountResult = await pool.query(
                'SELECT referrals_count FROM profiles WHERE user_id = $1',
                [referrerId]
              );
              const newReferralsCount = referralsCountResult.rows[0]?.referrals_count || 0;
              
              // Milestone rewards: 1, 2, 3, 5, 10, 25, 50
              const milestoneRewards = [
                { count: 1, reward: 50, xp: 100, premiumDays: 0 },
                { count: 2, reward: 100, xp: 200, premiumDays: 0 },
                { count: 3, reward: 200, xp: 500, premiumDays: 30 },
                { count: 5, reward: 250, xp: 500, premiumDays: 30 },
                { count: 10, reward: 500, xp: 1000, premiumDays: 90 },
                { count: 25, reward: 1500, xp: 2500, premiumDays: 180 },
                { count: 50, reward: 3000, xp: 5000, premiumDays: 365 }
              ];
              
              const milestone = milestoneRewards.find(m => m.count === newReferralsCount);
              if (milestone) {
                // Award milestone reward
                await pool.query(
                  `UPDATE profiles 
                   SET experience = experience + $1,
                       total_xp_earned = total_xp_earned + $1,
                       spendable_xp = COALESCE(spendable_xp, 0) + $1,
                       reputation = COALESCE(reputation, 0) + $2,
                       updated_at = now()
                   WHERE user_id = $3`,
                  [milestone.xp, milestone.reward, referrerId]
                );
                
                // Award Premium days if applicable
                if (milestone.premiumDays > 0) {
                  const { awardPremiumDays } = require('./routes/stars');
                  try {
                    await awardPremiumDays(pool, referrerId, milestone.premiumDays);
                  } catch (premError) {
                    logger.warn('Failed to award premium days for milestone', { error: premError.message });
                  }
                }
                
                logger.info('Milestone reward awarded', { 
                  referrerId, 
                  milestone: milestone.count, 
                  reward: milestone.reward, 
                  xp: milestone.xp,
                  premiumDays: milestone.premiumDays 
                });
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

// Security: Test endpoint disabled in production
// To enable for debugging, set ENABLE_TEST_ENDPOINTS=true in .env
if (process.env.ENABLE_TEST_ENDPOINTS === 'true') {
  app.post('/api/enqueue-test', authMiddleware, async (req, res) => {
    if (!jobsQueue) {
      return res.status(503).json({ ok: false, error: 'queue disabled' });
    }
    const { chatId, text } = req.body || {};
    if (!chatId) return res.status(400).json({ ok: false, error: 'chatId required' });

    const jobData = {
      type: 'send_message',
      chatId,
      text: text || 'Test message from Press F worker',
      token: BOT_TOKEN
    };

    try {
      const job = await jobsQueue.add(jobData);
      logger.info('Test job enqueued', { jobId: job.id, userId: req.userId });
      return res.json({ ok: true, jobId: job.id });
    } catch (e) {
      logger.error('Failed to enqueue job', { error: e?.message || e, jobType: jobData?.type });
      return res.status(500).json({ ok: false });
    }
  });
  logger.warn('⚠️ Test endpoints ENABLED — disable in production (ENABLE_TEST_ENDPOINTS)');
}

// endpoint to get session info (requires auth — user can only see their own session)
app.get('/api/session/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    if (!pool) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }

    // Security: User can only query their own session
    if (id !== req.sessionId) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only view your own session');
    }

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

    // Кнопка меню бота: при открытии чата пользователь видит "Открыть приложение" — открывает Web App
    if (WEB_APP_URL) {
      try {
        await bot.telegram.setChatMenuButton({
          type: 'web_app',
          text: 'Открыть приложение',
          web_app: { url: WEB_APP_URL }
        });
        logger.info('Menu button (Web App) set for /start');
      } catch (err) {
        logger.warn('Could not set menu button', { error: err?.message });
      }
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

// If GET / hits the backend, Traefik likely routed it here (frontend down or misconfigured). Return a hint instead of 404.
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).end(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Backend</title></head><body style="font-family:sans-serif;padding:2rem;background:#0f0d16;color:#fff;">' +
    '<h1>Backend</h1>' +
    '<p>This request reached the <strong>backend</strong>. The main page should be served by the <strong>frontend</strong> container.</p>' +
    '<p>If you see 404 in the Web App, run:</p>' +
    '<pre style="background:#1a1720;padding:1rem;border-radius:8px;">docker ps | grep frontend</pre>' +
    '<p>Ensure <code>pressf-frontend-1</code> is running. Then:</p>' +
    '<pre style="background:#1a1720;padding:1rem;border-radius:8px;">docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d frontend</pre>' +
    '</body></html>'
  );
});

// 404 handler for undefined routes (must be before error handler)
app.use(notFoundHandler);

// Global error handler (must be last middleware)
app.use(errorHandler);

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

    // Telegram: secret_key = HMAC-SHA256(key="WebAppData", message=bot_token)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return hmac === hash.toLowerCase();
  } catch (e) {
    logger.error('verifyInitData error', e);
    return false;
  }
}
