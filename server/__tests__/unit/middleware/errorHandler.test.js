// Unit tests for error handler middleware
const { errorHandler, asyncHandler, notFoundHandler } = require('../../../middleware/errorHandler');
const { AppError, ValidationError, NotFoundError } = require('../../../utils/AppError');
const { z } = require('zod');

// Mock logger
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('errorHandler', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      path: '/api/test',
      method: 'GET',
      userId: 123,
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
      body: null,
      query: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should handle AppError correctly', () => {
    const error = new ValidationError('Invalid input', { field: 'email' });
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'email' }
      }
    });
  });

  test('should handle ZodError correctly', () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'invalid' });
    const zodError = result.error;

    errorHandler(zodError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: expect.any(Object)
      }
    });
  });

  test('should handle database unique constraint violation', () => {
    const error = new Error('Duplicate key');
    error.code = '23505';
    error.detail = 'Key (email)=(test@example.com) already exists.';

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'Resource already exists',
        details: { field: error.detail }
      }
    });
  });

  test('should handle connection errors', () => {
    const error = new Error('Connection refused');
    error.code = 'ECONNREFUSED';

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
        details: null
      }
    });
  });

  test('should hide error details in production', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Internal error');
    error.stack = 'Error stack trace';

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: null
      }
    });
  });

  test('should show error details in development', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('Internal error');
    error.stack = 'Error stack trace';

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal error',
        details: expect.objectContaining({
          stack: 'Error stack trace'
        })
      }
    });
  });
});

describe('asyncHandler', () => {
  test('should catch async errors and pass to next', async () => {
    const req = {};
    const res = {};
    const next = jest.fn();
    const error = new Error('Async error');

    const asyncFn = asyncHandler(async () => {
      throw error;
    });

    await asyncFn(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test('should pass through successful async functions', async () => {
    const req = {};
    const res = { json: jest.fn() };
    const next = jest.fn();

    const asyncFn = asyncHandler(async (req, res) => {
      res.json({ ok: true });
    });

    await asyncFn(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('notFoundHandler', () => {
  test('should return 404 for undefined routes', () => {
    const req = {
      method: 'GET',
      path: '/api/unknown'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route GET /api/unknown not found',
        details: null
      }
    });
  });
});
