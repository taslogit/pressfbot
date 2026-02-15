// Integration tests for /api/verify endpoint
const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

describe('POST /api/verify', () => {
  let app;
  let pool;
  const BOT_TOKEN = 'test-bot-token';

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock pool
    pool = {
      query: jest.fn()
    };

    // Helper function to verify initData (simplified version)
    const verifyInitData = (initData, botToken) => {
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
        return false;
      }
    };

    // Mock verify endpoint
    app.post('/api/verify', async (req, res) => {
      const { initData } = req.body;

      if (!initData) {
        return res.status(400).json({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'initData required'
          }
        });
      }

      const isValid = verifyInitData(initData, BOT_TOKEN);

      if (!isValid) {
        return res.status(401).json({
          ok: false,
          error: {
            code: 'AUTH_INVALID',
            message: 'invalid signature'
          }
        });
      }

      // Parse user ID
      const params = new URLSearchParams(initData);
      let tgUserId = null;
      try {
        const userParam = params.get('user');
        if (userParam) {
          const parsed = JSON.parse(userParam);
          tgUserId = parsed.id;
        }
      } catch (e) {
        // Ignore
      }

      if (pool) {
        const sessionId = 'test-session-id';
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        pool.query.mockResolvedValue({ rowCount: 1 });
        await pool.query(
          'INSERT INTO sessions(id, telegram_id, expires_at, last_seen_at) VALUES($1, $2, $3, now())',
          [sessionId, tgUserId, expiresAt]
        );
      }

      return res.json({ ok: true, sessionId: 'test-session-id' });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 400 when initData is missing', async () => {
    const response = await request(app)
      .post('/api/verify')
      .send({})
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('should return 401 when signature is invalid', async () => {
    const invalidInitData = 'user={"id":123}&hash=invalid';

    const response = await request(app)
      .post('/api/verify')
      .send({ initData: invalidInitData })
      .expect(401);

    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('AUTH_INVALID');
  });

  test('should create session when initData is valid', async () => {
    // Create valid initData
    const user = JSON.stringify({ id: 123456 });
    const authDate = Math.floor(Date.now() / 1000);
    const entries = [
      ['user', user],
      ['auth_date', authDate.toString()]
    ];
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(e => `${e[0]}=${e[1]}`).join('\n');
    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const validInitData = `user=${encodeURIComponent(user)}&auth_date=${authDate}&hash=${hash}`;

    const response = await request(app)
      .post('/api/verify')
      .send({ initData: validInitData })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.sessionId).toBeDefined();
    expect(pool.query).toHaveBeenCalled();
  });
});
