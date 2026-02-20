// Integration tests for friends API
const request = require('supertest');
const express = require('express');
const { createFriendsRoutes } = require('../../../routes/friends');

jest.mock('../../../routes/activity', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));

describe('Friends API', () => {
  let app;
  let pool;
  let mockUserId;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    pool = {
      query: jest.fn()
    };

    app.use((req, res, next) => {
      req.userId = mockUserId === undefined ? 123456 : mockUserId;
      next();
    });

    const mockOnlineLimiter = (req, res, next) => next();
    const mockSuggestionsLimiter = (req, res, next) => next();
    app.use('/api/friends', createFriendsRoutes(pool, mockOnlineLimiter, mockSuggestionsLimiter));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 123456;
    // Default: any unmocked query returns empty rows (avoids undefined.rows in route)
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('GET /api/friends', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).get('/api/friends').expect(401);
      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should return 503 when database is unavailable', async () => {
      const routesWithoutPool = createFriendsRoutes(null, (req, res, next) => next(), (req, res, next) => next());
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req, res, next) => { req.userId = 123456; next(); });
      testApp.use('/api/friends', routesWithoutPool);
      const response = await request(testApp).get('/api/friends');
      expect(response.status).toBe(503);
      expect(response.body.ok).toBe(false);
      expect(response.body.error?.code).toBe('DB_UNAVAILABLE');
    });

    test('should return friends list for authenticated user', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              user_id: 789,
              avatar: 'pressf',
              title: 'Friend',
              level: 2,
              experience: 100,
              accepted_at: new Date()
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const response = await request(app).get('/api/friends').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.friends).toBeDefined();
      expect(Array.isArray(response.body.friends)).toBe(true);
      expect(response.body.total).toBe(1);
      expect(response.body.hasMore).toBe(false);
    });

    test('should validate limit parameter', async () => {
      const response = await request(app).get('/api/friends?limit=200').expect(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
      expect(response.body.error?.details?.fieldErrors?.limit != null || response.body.error?.message).toBeTruthy();
    });

    test('should validate offset parameter', async () => {
      const response = await request(app).get('/api/friends?offset=-1').expect(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error?.code).toBe('VALIDATION_ERROR');
      expect(response.body.error?.details?.fieldErrors?.offset != null || response.body.error?.message).toBeTruthy();
    });
  });

  describe('GET /api/friends/pending', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).get('/api/friends/pending').expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should return pending requests', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, from_user_id: 999, created_at: new Date(), avatar: 'a', title: 'U', level: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/api/friends/pending').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.incoming).toBeDefined();
      expect(response.body.outgoing).toBeDefined();
    });
  });

  describe('POST /api/friends/request/:userId', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).post('/api/friends/request/789').expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should validate userId param (must be numeric)', async () => {
      const response = await request(app).post('/api/friends/request/abc').expect(400);
      expect(response.body.ok).toBe(false);
    });

    test('should return 400 when adding self as friend', async () => {
      const response = await request(app).post('/api/friends/request/123456').expect(400);
      expect(response.body.error?.message).toMatch(/yourself|Cannot add yourself/i);
    });

    test('should return 404 when target user not found', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 0 });
      const response = await request(app).post('/api/friends/request/999999').expect(404);
      expect(response.body.error?.code).toBe('USER_NOT_FOUND');
    });

    test('should send friend request when user exists and no existing friendship', async () => {
      pool.query
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: 1, created_at: new Date() }], rowCount: 1 });
      const response = await request(app).post('/api/friends/request/789').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.message).toMatch(/request sent|sent/i);
      expect(response.body.id).toBeDefined();
    });
  });

  describe('POST /api/friends/accept/:userId', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).post('/api/friends/accept/789').expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should return 404 when no pending request from that user', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 0 });
      const response = await request(app).post('/api/friends/accept/789').expect(404);
      expect(response.body.error?.code).toBe('REQUEST_NOT_FOUND');
    });

    test('should accept friend request', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ title: 'U', avatar: 'a' }] })
        .mockResolvedValueOnce({ rows: [{ title: 'Me', avatar: 'b' }] });
      const response = await request(app).post('/api/friends/accept/789').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.message).toMatch(/accepted/i);
    });
  });

  describe('POST /api/friends/decline/:userId', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).post('/api/friends/decline/789').expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should decline and return ok', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });
      const response = await request(app).post('/api/friends/decline/789').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.deleted).toBeDefined();
    });
  });

  describe('DELETE /api/friends/:userId', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).delete('/api/friends/789').expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should validate userId param', async () => {
      const response = await request(app).delete('/api/friends/xyz').expect(400);
      expect(response.body.ok).toBe(false);
    });

    test('should remove friend and return ok', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });
      const response = await request(app).delete('/api/friends/789').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.deleted).toBe(true);
    });
  });

  describe('GET /api/friends/search', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).get('/api/friends/search?q=test').expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should return empty users when q is short', async () => {
      const response = await request(app).get('/api/friends/search?q=a').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.users).toEqual([]);
    });

    test('should return users when q length >= 2', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ user_id: 888, avatar: 'a', title: 'Test', level: 1, is_friend: false, has_pending: false }]
      });
      const response = await request(app).get('/api/friends/search?q=te').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.users).toBeDefined();
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    test('should validate limit for search', async () => {
      const response = await request(app).get('/api/friends/search?q=test&limit=100').expect(400);
      expect(response.body.ok).toBe(false);
    });
  });

  describe('GET /api/friends/suggestions', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).get('/api/friends/suggestions').expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should return suggestions', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const response = await request(app).get('/api/friends/suggestions').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.suggestions).toBeDefined();
    });

    test('should validate limit', async () => {
      const response = await request(app).get('/api/friends/suggestions?limit=100').expect(400);
      expect(response.body.ok).toBe(false);
    });
  });

  describe('GET /api/friends/online', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).get('/api/friends/online').expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should return online friends list', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ user_id: 789, avatar: 'a', title: 'Online', level: 1, last_seen_at: new Date() }]
      });
      const response = await request(app).get('/api/friends/online').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.friends).toBeDefined();
      expect(Array.isArray(response.body.friends)).toBe(true);
    });
  });
});
