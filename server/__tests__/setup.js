// Test setup file
// This file sets up the testing environment

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_token';
process.env.WEB_APP_URL = process.env.WEB_APP_URL || 'https://test.example.com';

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Helper to create test user
  createTestUser: async (pool, telegramId = 123456789) => {
    const { v4: uuidv4 } = require('uuid');
    const sessionId = uuidv4();
    await pool.query(
      'INSERT INTO sessions(id, telegram_id, expires_at, last_seen_at) VALUES($1, $2, $3, now())',
      [sessionId, telegramId, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );
    return { sessionId, telegramId };
  },
  
  // Helper to cleanup test data
  cleanup: async (pool) => {
    await pool.query('DELETE FROM sessions WHERE telegram_id >= 100000000');
    await pool.query('DELETE FROM profiles WHERE user_id >= 100000000');
  }
};
