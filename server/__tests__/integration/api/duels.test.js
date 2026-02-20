// Integration tests for duels API
const request = require('supertest');
const express = require('express');
const { createDuelsRoutes } = require('../../../routes/duels');

describe('Duels API', () => {
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

    const mockLimiter = (req, res, next) => next();
    const mockDuelLimitCheck = (req, res, next) => next();
    app.use('/api/duels', createDuelsRoutes(pool, mockLimiter, mockDuelLimitCheck));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 123456;
  });

  describe('GET /api/duels', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app).get('/api/duels').expect(401);
      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should return 503 when database is unavailable', async () => {
      const routesWithoutPool = createDuelsRoutes(null, (req, res, next) => next(), (req, res, next) => next());
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req, res, next) => { req.userId = 123456; next(); });
      testApp.use('/api/duels', routesWithoutPool);
      const response = await request(testApp).get('/api/duels');
      expect([503, 500]).toContain(response.status);
      expect(response.body.ok).toBe(false);
    });

    test('should return duels for authenticated user', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'duel_1',
            challenger_id: 123456,
            opponent_id: null,
            opponent_name: 'Someone',
            title: 'Test',
            stake: 'Stake',
            deadline: new Date(),
            status: 'pending',
            is_public: false,
            is_team: false,
            witness_count: 0,
            loser_id: null,
            is_favorite: false,
            created_at: new Date(),
            updated_at: new Date()
          }
        ]
      });
      const response = await request(app).get('/api/duels').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.duels).toBeDefined();
      expect(Array.isArray(response.body.duels)).toBe(true);
    });

    test('should validate limit parameter', async () => {
      const response = await request(app).get('/api/duels?limit=200').expect(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error?.details?.field).toBe('limit');
    });

    test('should validate offset parameter', async () => {
      const response = await request(app).get('/api/duels?offset=-1').expect(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error?.details?.field).toBe('offset');
    });

    test('should validate status parameter', async () => {
      const response = await request(app).get('/api/duels?status=invalid').expect(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error?.details?.field).toBe('status');
    });

    test('should validate sortBy parameter', async () => {
      const response = await request(app).get('/api/duels?sortBy=invalid').expect(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.error?.details?.field).toBe('sortBy');
    });
  });

  describe('POST /api/duels', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;
      const response = await request(app)
        .post('/api/duels')
        .send({ title: 'Test', stake: 'Stake' })
        .expect(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should validate body (invalid status)', async () => {
      const response = await request(app)
        .post('/api/duels')
        .send({ title: 'Test', status: 'invalid_status' })
        .expect(400);
      expect(response.body.ok).toBe(false);
    });

    test('should create duel with valid data', async () => {
      pool.query
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 });
      const response = await request(app)
        .post('/api/duels')
        .send({
          title: 'Test Duel',
          stake: 'Coffee',
          status: 'pending'
        })
        .expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.id).toBeDefined();
      expect(typeof response.body.xp).toBe('number');
    });

    test('should return 404 when opponentId provided but user not found', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 0 });
      const response = await request(app)
        .post('/api/duels')
        .send({ title: 'Duel', opponentId: 999999 })
        .expect(404);
      expect(response.body.error?.code).toBe('OPPONENT_NOT_FOUND');
    });
  });

  describe('GET /api/duels/:id', () => {
    test('should return 404 when duel not found', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 0 });
      const response = await request(app).get('/api/duels/nonexistent_id').expect(404);
      expect(response.body.error?.code).toBe('DUEL_NOT_FOUND');
    });

    test('should return duel when found', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'duel_1',
            challenger_id: 123456,
            opponent_id: null,
            opponent_name: 'Opp',
            title: 'T',
            stake: 'S',
            deadline: new Date(),
            status: 'pending',
            is_public: true,
            is_team: false,
            witness_count: 0,
            loser_id: null,
            is_favorite: false,
            created_at: new Date(),
            updated_at: new Date(),
            view_count: 0
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 });
      const response = await request(app).get('/api/duels/duel_1').expect(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.duel).toBeDefined();
      expect(response.body.duel.id).toBe('duel_1');
    });
  });
});
