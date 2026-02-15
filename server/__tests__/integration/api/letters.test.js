// Integration tests for letters API
const request = require('supertest');
const express = require('express');
const { createLettersRoutes } = require('../../../routes/letters');

describe('Letters API', () => {
  let app;
  let pool;
  let mockUserId;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock pool
    pool = {
      query: jest.fn()
    };

    // Mock auth middleware
    app.use((req, res, next) => {
      req.userId = mockUserId || 123456;
      next();
    });

    // Mock rate limiter
    const mockLimiter = (req, res, next) => next();

    // Register routes
    app.use('/api/letters', createLettersRoutes(pool, mockLimiter));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 123456;
  });

  describe('GET /api/letters', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;

      const response = await request(app)
        .get('/api/letters')
        .expect(401);

      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should return 503 when database is unavailable', async () => {
      const routesWithoutPool = createLettersRoutes(null, jest.fn());
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req, res, next) => {
        req.userId = 123456;
        next();
      });
      testApp.use('/api/letters', routesWithoutPool);

      const response = await request(testApp)
        .get('/api/letters')
        .expect(503);

      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe('DB_UNAVAILABLE');
    });

    test('should return letters for authenticated user', async () => {
      const mockLetters = [
        {
          id: 'letter-1',
          user_id: 123456,
          title: 'Test Letter',
          content: 'Test content',
          status: 'scheduled',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      pool.query.mockResolvedValue({
        rows: mockLetters,
        rowCount: mockLetters.length
      });

      const response = await request(app)
        .get('/api/letters')
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.letters).toBeDefined();
      expect(Array.isArray(response.body.letters)).toBe(true);
    });

    test('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/api/letters?limit=200')
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.field).toBe('limit');
    });

    test('should validate offset parameter', async () => {
      const response = await request(app)
        .get('/api/letters?offset=-1')
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.field).toBe('offset');
    });
  });

  describe('POST /api/letters', () => {
    test('should return 401 when user is not authenticated', async () => {
      mockUserId = null;

      const response = await request(app)
        .post('/api/letters')
        .send({
          title: 'Test Letter',
          content: 'Test content'
        })
        .expect(401);

      expect(response.body.ok).toBe(false);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/letters')
        .send({})
        .expect(400);

      expect(response.body.ok).toBe(false);
    });

    test('should create letter with valid data', async () => {
      const letterData = {
        title: 'Test Letter',
        content: 'Test content',
        unlockDate: new Date(Date.now() + 86400000).toISOString(),
        status: 'scheduled'
      };

      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'new-letter-id',
          user_id: 123456,
          ...letterData,
          created_at: new Date(),
          updated_at: new Date()
        }],
        rowCount: 1
      });

      const response = await request(app)
        .post('/api/letters')
        .send(letterData)
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.letter).toBeDefined();
      expect(response.body.letter.title).toBe(letterData.title);
    });
  });
});
