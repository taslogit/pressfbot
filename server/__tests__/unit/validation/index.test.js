// Unit tests for validation middleware
// 5.5.4.1: Unit tests for critical functions (validation)

const { z, validateBody, validateQuery, validateParams } = require('../../../validation');
const { sendValidationError } = require('../../../utils/errors');

jest.mock('../../../utils/errors', () => ({
  sendValidationError: jest.fn((res, error) => {
    res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload', details: error } });
  })
}));

describe('Validation middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockNext = jest.fn();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockReq = {
      body: {},
      query: {},
      params: {}
    };
  });

  describe('validateBody', () => {
    test('should pass valid body', () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive()
      });
      mockReq.body = { name: 'Test', age: 25 };
      const middleware = validateBody(schema);
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockReq.body).toEqual({ name: 'Test', age: 25 });
    });

    test('should reject invalid body', () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive()
      });
      mockReq.body = { name: '', age: -5 };
      const middleware = validateBody(schema);
      middleware(mockReq, mockRes, mockNext);
      expect(sendValidationError).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateQuery', () => {
    test('should validate and transform query params', () => {
      const schema = z.object({
        limit: z.preprocess((val) => val === undefined ? undefined : Number(val), z.number().int().min(1).max(100).optional()),
        offset: z.preprocess((val) => val === undefined ? undefined : Number(val), z.number().int().min(0).optional())
      }).passthrough();
      mockReq.query = { limit: '10', offset: '5', other: 'preserved' };
      const middleware = validateQuery(schema);
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockReq.query.limit).toBe(10);
      expect(mockReq.query.offset).toBe(5);
      expect(mockReq.query.other).toBe('preserved');
    });

    test('should reject invalid query params', () => {
      const schema = z.object({
        limit: z.preprocess((val) => val === undefined ? undefined : Number(val), z.number().int().min(1).max(100).optional())
      });
      mockReq.query = { limit: '200' };
      const middleware = validateQuery(schema);
      middleware(mockReq, mockRes, mockNext);
      expect(sendValidationError).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateParams', () => {
    test('should validate and transform URL params', () => {
      const schema = z.object({
        userId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())
      });
      mockReq.params = { userId: '12345' };
      const middleware = validateParams(schema);
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockReq.params.userId).toBe(12345);
    });

    test('should reject invalid URL params', () => {
      const schema = z.object({
        userId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())
      });
      mockReq.params = { userId: 'abc' };
      const middleware = validateParams(schema);
      middleware(mockReq, mockRes, mockNext);
      expect(sendValidationError).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should reject negative userId', () => {
      const schema = z.object({
        userId: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())
      });
      mockReq.params = { userId: '-1' };
      const middleware = validateParams(schema);
      middleware(mockReq, mockRes, mockNext);
      expect(sendValidationError).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
