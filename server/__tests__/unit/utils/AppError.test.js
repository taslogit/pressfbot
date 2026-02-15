// Unit tests for AppError classes
const {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError
} = require('../../../utils/AppError');

describe('AppError', () => {
  test('should create AppError with default values', () => {
    const error = new AppError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.isOperational).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  test('should create AppError with custom values', () => {
    const error = new AppError('Custom error', 400, 'CUSTOM_CODE', { field: 'test' });
    expect(error.message).toBe('Custom error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('CUSTOM_CODE');
    expect(error.details).toEqual({ field: 'test' });
  });

  test('should have stack trace', () => {
    const error = new AppError('Test error');
    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });
});

describe('ValidationError', () => {
  test('should create ValidationError with correct defaults', () => {
    const error = new ValidationError('Invalid input');
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error).toBeInstanceOf(AppError);
  });

  test('should accept details', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const error = new ValidationError('Invalid email', details);
    expect(error.details).toEqual(details);
  });
});

describe('AuthenticationError', () => {
  test('should create AuthenticationError with correct defaults', () => {
    const error = new AuthenticationError();
    expect(error.message).toBe('Authentication required');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTH_REQUIRED');
  });

  test('should accept custom message', () => {
    const error = new AuthenticationError('Please login');
    expect(error.message).toBe('Please login');
  });
});

describe('AuthorizationError', () => {
  test('should create AuthorizationError with correct defaults', () => {
    const error = new AuthorizationError();
    expect(error.message).toBe('Access forbidden');
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('NotFoundError', () => {
  test('should create NotFoundError with default message', () => {
    const error = new NotFoundError();
    expect(error.message).toBe('Resource not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  test('should create NotFoundError with custom resource', () => {
    const error = new NotFoundError('User');
    expect(error.message).toBe('User not found');
  });
});

describe('ConflictError', () => {
  test('should create ConflictError', () => {
    const error = new ConflictError('Resource already exists');
    expect(error.message).toBe('Resource already exists');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });
});

describe('RateLimitError', () => {
  test('should create RateLimitError with correct defaults', () => {
    const error = new RateLimitError();
    expect(error.message).toBe('Too many requests');
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});

describe('DatabaseError', () => {
  test('should create DatabaseError with correct defaults', () => {
    const error = new DatabaseError();
    expect(error.message).toBe('Database operation failed');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('DATABASE_ERROR');
  });
});

describe('ExternalServiceError', () => {
  test('should create ExternalServiceError', () => {
    const error = new ExternalServiceError('Telegram', 'Connection timeout');
    expect(error.message).toBe('Telegram: Connection timeout');
    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
  });
});
