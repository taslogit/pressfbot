// Test setup and teardown
// This file runs before all tests

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-bot-token';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Global test utilities
global.mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
};

// Cleanup after all tests
afterAll(async () => {
  // Close any open connections
  if (global.mockPool.end) {
    await global.mockPool.end();
  }
});
