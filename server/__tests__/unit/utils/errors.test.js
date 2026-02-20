/**
 * Unit tests for error response helpers
 */
const { sendError, sendValidationError, sendAppError } = require('../../../utils/errors');
const { AppError } = require('../../../utils/AppError');
const { z } = require('zod');

describe('errors', () => {
  let res;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('sendError', () => {
    test('sends status and json with code and message', () => {
      sendError(res, 400, 'BAD_REQUEST', 'Invalid');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid', details: undefined }
      });
    });

    test('includes details when provided', () => {
      sendError(res, 422, 'VALIDATION_ERROR', 'Invalid', { field: 'x' });
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: { field: 'x' } }
      });
    });
  });

  describe('sendValidationError', () => {
    test('sends 400 with VALIDATION_ERROR and flattened zod error', () => {
      const schema = z.object({ x: z.number() });
      const result = schema.safeParse({ x: 'not a number' });
      expect(result.success).toBe(false);
      sendValidationError(res, result.error);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          details: result.error.flatten()
        }
      });
    });
  });

  describe('sendAppError', () => {
    test('sends status and json from AppError instance', () => {
      const appError = new AppError('Not found', 404, 'NOT_FOUND', { id: 1 });
      sendAppError(res, appError);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Not found',
          details: { id: 1 }
        }
      });
    });
  });
});
