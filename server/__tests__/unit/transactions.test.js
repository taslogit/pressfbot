/**
 * Tests for transaction behaviour (ROLLBACK on error, client release)
 * and race conditions (idempotency / double-use protection).
 */

const request = require('supertest');
const express = require('express');
const { createStarsRoutes } = require('../../routes/stars');

describe('Transactions and race conditions', () => {
  describe('Stars trial activation (transaction rollback)', () => {
    let app;
    let pool;
    let client;
    let queryCalls;
    let releaseCalled;

    function createApp() {
      const application = express();
      application.use(express.json());
      application.use((req, res, next) => {
        req.userId = 123456;
        next();
      });
      application.use('/api/stars', createStarsRoutes(pool, null));
      return application;
    }

    beforeEach(() => {
      queryCalls = [];
      releaseCalled = false;
      client = {
        query: jest.fn().mockImplementation((sql) => {
          queryCalls.push(sql?.trim().split(/\s+/)[0] || sql);
          if (sql === 'BEGIN') return Promise.resolve();
          if (sql === 'ROLLBACK') return Promise.resolve();
          if (sql === 'COMMIT') return Promise.resolve();
          return Promise.resolve({ rows: [], rowCount: 0 });
        }),
        release: jest.fn().mockImplementation(() => {
          releaseCalled = true;
        })
      };
      pool = {
        query: jest.fn(),
        connect: jest.fn().mockResolvedValue(client)
      };
      app = createApp();
    });

    test('on success: BEGIN, COMMIT, and release are called', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ trial_used_at: null, premium_expires_at: null }]
      });
      const res = await request(app).post('/api/stars/activate-trial').expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.expiresAt).toBeDefined();
      expect(pool.connect).toHaveBeenCalled();
      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();
      expect(queryCalls.filter(c => c === 'ROLLBACK')).toHaveLength(0);
    });

    test('on error after BEGIN: ROLLBACK is called and client is released', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ trial_used_at: null, premium_expires_at: null }]
      });
      const rollbackCalls = [];
      client.query.mockImplementation((sql) => {
        if (sql === 'BEGIN') return Promise.resolve();
        if (sql === 'ROLLBACK') {
          rollbackCalls.push(1);
          return Promise.resolve();
        }
        if (sql === 'COMMIT') return Promise.resolve();
        const isUpdate = typeof sql === 'string' && sql.includes('UPDATE');
        if (isUpdate) return Promise.reject(new Error('UPDATE failed'));
        return Promise.resolve({ rows: [], rowCount: 0 });
      });
      const res = await request(app).post('/api/stars/activate-trial');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error?.code).toBe('TRIAL_ACTIVATE_FAILED');
      expect(rollbackCalls.length).toBeGreaterThanOrEqual(1);
      expect(client.release).toHaveBeenCalled();
    });

    test('client.release is called even when ROLLBACK throws', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ trial_used_at: null, premium_expires_at: null }]
      });
      client.query.mockImplementation((sql) => {
        if (sql === 'BEGIN') return Promise.resolve();
        if (sql === 'ROLLBACK') return Promise.reject(new Error('ROLLBACK failed'));
        if (sql === 'COMMIT') return Promise.resolve();
        const isUpdate = typeof sql === 'string' && sql.includes('UPDATE');
        if (isUpdate) return Promise.reject(new Error('UPDATE failed'));
        return Promise.resolve({ rows: [], rowCount: 0 });
      });
      const res = await request(app).post('/api/stars/activate-trial');
      expect(res.status).toBe(500);
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('Race conditions / idempotency', () => {
    let app;
    let pool;

    beforeEach(() => {
      pool = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        connect: jest.fn()
      };
      const application = express();
      application.use(express.json());
      application.use((req, res, next) => { req.userId = 123456; next(); });
      application.use('/api/stars', createStarsRoutes(pool, null));
      app = application;
    });

    test('trial already used returns 400 (prevents double activation)', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ trial_used_at: new Date(), premium_expires_at: new Date() }]
      });
      const res = await request(app).post('/api/stars/activate-trial');
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.code).toBe('TRIAL_ALREADY_USED');
      expect(pool.connect).not.toHaveBeenCalled();
    });

    test('profile not found returns 404 (no transaction started)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/stars/activate-trial');
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('PROFILE_NOT_FOUND');
      expect(pool.connect).not.toHaveBeenCalled();
    });
  });
});
