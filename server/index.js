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

// Redis / Bull (job queue)
const Queue = require('bull');
const REDIS_URL = process.env.REDIS_URL;
const jobsQueue = REDIS_URL ? new Queue('jobs', REDIS_URL) : null;
if (jobsQueue) {
  jobsQueue.on('error', (err) => console.error('Jobs queue error', err));
  jobsQueue.on('failed', (job, err) => console.error('Job failed', job.id, err));
} else {
  console.warn('⚠️  REDIS_URL not set - job queue disabled');
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // https://your-backend-domain
const WEB_APP_URL =
  process.env.WEB_APP_URL ||
  process.env.WEBAPP_URL ||
  process.env.FRONTEND_URL ||
  '';
const USE_WEBHOOK = Boolean(WEBHOOK_URL) && process.env.BOT_USE_WEBHOOK !== 'false';
console.log('Webhook config:', { WEBHOOK_URL, BOT_USE_WEBHOOK: process.env.BOT_USE_WEBHOOK, USE_WEBHOOK });
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

if (!BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in env');
  process.exit(1);
}

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

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
  console.log('[/start] Received start command from user:', ctx.from?.id);
  if (!WEB_APP_URL) {
    console.warn('[/start] WEB_APP_URL not set');
    return ctx.reply('WebApp URL is not set. Define WEB_APP_URL in .env');
  }
  if (BOT_INFO_IMAGE_URL) {
    console.log('[/start] Attempting to send image:', BOT_INFO_IMAGE_URL);
    try {
      const result = await ctx.replyWithPhoto(
        { url: BOT_INFO_IMAGE_URL },
        { caption: BOT_INFO_TEXT, ...buildStartKeyboard() }
      );
      console.log('[/start] Image sent successfully');
      return result;
    } catch (error) {
      console.error('[/start] Failed to send bot info image:', error?.message || error);
      console.log('[/start] Falling back to text message');
    }
  } else {
    console.log('[/start] BOT_INFO_IMAGE_URL not set, sending text only');
  }
  return ctx.reply(BOT_INFO_TEXT, buildStartKeyboard());
};

const sendWebAppButton = (ctx) => {
  if (!WEB_APP_URL) {
    return ctx.reply('WebApp URL is not set. Define WEB_APP_URL in .env');
  }
  return ctx.reply('Открыть WebApp', buildStartKeyboard());
};

bot.start(sendStartMessage);
bot.command('open', sendWebAppButton);
bot.command('info', (ctx) => ctx.reply(BOT_INFO_TEXT));

const app = express();
app.use(express.json({ limit: '200kb' }));

// Telegram webhook callback (MUST be first, before any other middleware)
if (USE_WEBHOOK) {
  app.use(bot.webhookCallback('/bot'));
  // Add a simple handler for HEAD/GET requests to /bot for debugging
  app.head('/bot', (req, res) => {
    console.log('HEAD /bot received');
    res.status(200).end();
  });
  app.get('/bot', (req, res) => {
    console.log('GET /bot received');
    res.status(200).json({ ok: true, message: 'Webhook endpoint is active' });
  });
  console.log('✅ Webhook callback registered at /bot');
} else {
  console.warn('⚠️  Webhook callback NOT registered. USE_WEBHOOK=false');
}

app.use(helmet());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/verify', verifyLimiter);

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
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
const { normalizeLetter } = require('./services/lettersService');
const { normalizeDuel } = require('./services/duelsService');
const { normalizeLegacyItem } = require('./services/legacyService');

// Apply auth middleware
const authMiddleware = createAuthMiddleware(pool);

// Register API routes
app.use('/api/letters', authMiddleware, createLettersRoutes(pool));
app.use('/api/profile', authMiddleware, createProfileRoutes(pool));
app.use('/api/duels', authMiddleware, createDuelsRoutes(pool));
app.use('/api/legacy', authMiddleware, createLegacyRoutes(pool));
app.use('/api/notifications', authMiddleware, createNotificationsRoutes(pool));
app.use('/api/ton', authMiddleware, createTonRoutes(pool));

// Global search across letters, duels, legacy
app.get('/api/search', authMiddleware, async (req, res) => {
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
    const limit = limitRaw ? Number(limitRaw) : 10;

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

    const like = `%${q}%`;

    const lettersResult = await pool.query(
      `SELECT * FROM letters
       WHERE user_id = $1
         AND (
           title ILIKE $2 OR content ILIKE $2 OR array_to_string(recipients, ' ') ILIKE $2
         )
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, like, limit]
    );

    const duelsResult = await pool.query(
      `SELECT * FROM duels
       WHERE (challenger_id = $1 OR opponent_id = $1)
         AND (
           title ILIKE $2 OR stake ILIKE $2 OR opponent_name ILIKE $2
         )
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, like, limit]
    );

    const legacyResult = await pool.query(
      `SELECT * FROM legacy_items
       WHERE user_id = $1
         AND (
           title ILIKE $2 OR description ILIKE $2
         )
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, like, limit]
    );

    return res.json({
      ok: true,
      letters: lettersResult.rows.map(normalizeLetter),
      duels: duelsResult.rows.map(normalizeDuel),
      legacy: legacyResult.rows.map(normalizeLegacyItem)
    });
  } catch (error) {
    console.error('Search error:', error);
    return sendError(res, 500, 'SEARCH_FAILED', 'Failed to search');
  }
});

// Health check (no auth)
app.get('/api/health', async (_req, res) => {
  const health = {
    ok: true,
    timestamp: Date.now(),
    db: 'unknown'
  };

  if (!pool) {
    health.db = 'disabled';
    return res.json(health);
  }

  try {
    await pool.query('SELECT 1');
    health.db = 'ok';
    return res.json(health);
  } catch (e) {
    health.ok = false;
    health.db = 'error';
    return res.status(500).json(health);
  }
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
    console.log('✅ Sessions table exists');

    if (SESSION_CLEANUP_INTERVAL_SECONDS > 0) {
      const interval = setInterval(async () => {
        try {
          const result = await pool.query(
            'DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= now()'
          );
          if (result.rowCount > 0) {
            console.log(`🧹 Cleaned up ${result.rowCount} expired sessions`);
          }
        } catch (cleanupError) {
          console.warn('Failed to clean up expired sessions', cleanupError);
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
              console.warn('Failed to notify unlock', notifyError);
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
              console.warn('Failed to notify check-in', notifyError);
            }
          }
        } catch (notifyError) {
          console.warn('Notification job failed', notifyError);
        }
      };

      const notifyInterval = setInterval(runNotifications, NOTIFY_INTERVAL_SECONDS * 1000);
      if (notifyInterval.unref) {
        notifyInterval.unref();
      }
      runNotifications();
    }
    
    // Run all migrations
    await createTables(pool);
    console.log('✅ Database initialized successfully');
  } catch (e) {
    console.error('❌ Failed to initialize database:', e);
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
      await pool.query(
        'INSERT INTO sessions(id, telegram_id, init_data, expires_at, last_seen_at) VALUES($1, $2, $3, $4, now())',
        [sessionId, tgUserId, initData, expiresAt]
      );
    }
    return res.json({ ok: true, sessionId });
  } catch (e) {
    console.error('Failed to create session', e);
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

// endpoint to get session info
app.get('/api/session/:id', async (req, res) => {
  const id = req.params.id;
  try {
    if (!pool) {
      return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
    }
    const r = await pool.query('SELECT id, telegram_id, init_data, created_at FROM sessions WHERE id=$1', [id]);
    if (r.rowCount === 0) {
      return sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
    }
    return res.json({ ok: true, session: r.rows[0] });
  } catch (e) {
    console.error('Failed to fetch session', e);
    return sendError(res, 500, 'SESSION_FETCH_FAILED', 'Failed to fetch session');
  }
});

// Use webhook if WEBHOOK_URL provided, otherwise fall back to long polling
(async () => {
  try {
    if (USE_WEBHOOK) {
      await bot.telegram.setWebhook(`${WEBHOOK_URL}/bot`);
      console.log('Webhook set to', `${WEBHOOK_URL}/bot`);
    } else if (WEBHOOK_URL) {
      await bot.telegram.deleteWebhook();
      console.log('Webhook disabled, using long polling');
      await bot.launch();
      console.log('Bot launched via long polling');
    } else {
      await bot.launch();
      console.log('Bot launched via long polling');
    }
  } catch (e) {
    console.error('Failed to set webhook or launch bot:', e?.message || e);
  }
})();

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

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
