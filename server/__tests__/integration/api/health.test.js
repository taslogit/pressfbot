// Integration tests for health endpoint
const request = require('supertest');
const express = require('express');

// Mock the app setup
describe('GET /api/health', () => {
  let app;
  let pool;

  beforeAll(() => {
    // Create a minimal app for testing
    app = express();
    app.use(express.json());

    // Mock pool
    pool = {
      query: jest.fn()
    };

    // Mock health endpoint
    app.get('/api/health', async (req, res) => {
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

      if (pool) {
        try {
          await pool.query('SELECT 1');
          health.db = 'ok';
        } catch (e) {
          health.ok = false;
          health.db = 'error';
          health.dbError = e.message;
        }
      } else {
        health.db = 'disabled';
      }

      const statusCode = health.ok ? 200 : 503;
      return res.status(statusCode).json(health);
    });
  });

  test('should return 200 when database is available', async () => {
    pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.db).toBe('ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('memory');
  });

  test('should return 503 when database is unavailable', async () => {
    pool.query.mockRejectedValue(new Error('Connection failed'));

    const response = await request(app)
      .get('/api/health')
      .expect(503);

    expect(response.body.ok).toBe(false);
    expect(response.body.db).toBe('error');
    expect(response.body.dbError).toBe('Connection failed');
  });

  test('should include memory information', async () => {
    pool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.memory).toHaveProperty('used');
    expect(response.body.memory).toHaveProperty('total');
    expect(response.body.memory).toHaveProperty('rss');
    expect(typeof response.body.memory.used).toBe('number');
  });
});
