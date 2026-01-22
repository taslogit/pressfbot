// Simple worker using Bull to process background jobs (Redis required)
const Queue = require('bull');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.warn('⚠️  REDIS_URL not set - worker disabled');
  process.exit(0);
}
const jobs = new Queue('jobs', REDIS_URL);

jobs.process(async (job) => {
  console.log('Processing job', job.id, job.data);
  // Example job: send reminder via Telegram
  if (job.data.type === 'send_message') {
    const { chatId, text, token } = job.data;
    try {
      const { Telegraf } = require('telegraf');
      const bot = new Telegraf(token);
      await bot.telegram.sendMessage(chatId, text);
      console.log('Message sent to', chatId);
      return Promise.resolve();
    } catch (e) {
      console.error('Failed to send message', e);
      return Promise.reject(e);
    }
  }
  return Promise.resolve();
});

console.log('Worker started, listening for jobs');
