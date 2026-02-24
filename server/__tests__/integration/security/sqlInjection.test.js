/**
 * 8.2.3: Integration tests for SQL injection safety.
 * Ensures search and other user-controlled inputs are passed as bound parameters, not concatenated into SQL.
 */
const request = require('supertest');
const express = require('express');
const { createFriendsRoutes } = require('../../../routes/friends');

jest.mock('../../../routes/activity', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));

describe('SQL injection safety', () => {
  let app;
  let pool;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    pool = { query: jest.fn() };
    app.use((req, res, next) => {
      req.userId = 999888;
      next();
    });
    const noop = (req, res, next) => next();
    app.use('/api/friends', createFriendsRoutes(pool, noop, noop, noop));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('GET /api/friends/search', () => {
    const maliciousPayloads = [
      "'; DROP TABLE profiles; --",
      "1' OR '1'='1",
      "1; INSERT INTO profiles (user_id) VALUES (1); --",
      "\\'; SELECT * FROM profiles WHERE user_id = 1; --"
    ];

    test.each(maliciousPayloads)('should not crash and should use parameterized query for malicious q', async (q) => {
      const response = await request(app)
        .get('/api/friends/search')
        .query({ q });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);

      if (pool.query.mock.calls.length > 0) {
        const [sql, params] = pool.query.mock.calls[0];
        expect(typeof sql).toBe('string');
        expect(Array.isArray(params)).toBe(true);
        expect(sql).toMatch(/\$1|\$2|\$3|\$4/);
      }
    });

    test('should pass user input as bound parameter not in SQL text', async () => {
      const q = "'; DROP TABLE profiles; --";
      await request(app).get('/api/friends/search').query({ q });
      expect(pool.query.mock.calls.length).toBeGreaterThan(0);
      const [sql] = pool.query.mock.calls[0];
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain(q);
    });
  });
});
