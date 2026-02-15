const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z, validateBody } = require('../validation');
const { sendError } = require('../utils/errors');

const router = express.Router();

const inheritanceSchema = z.object({
  recipients: z.array(
    z.object({
      address: z.string().min(4),
      amount: z.number().positive()
    })
  ).min(1),
  tokenSymbol: z.string().min(2).max(20),
  totalAmount: z.number().positive(),
  triggerType: z.string().optional(),
  txHash: z.string().optional()
});

const storageSchema = z.object({
  letterId: z.string().optional(),
  storageProvider: z.string().min(2),
  planType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
  txHash: z.string().optional()
});

const duelEscrowSchema = z.object({
  duelId: z.string().min(1),
  challengerAddress: z.string().min(4),
  opponentAddress: z.string().optional(),
  tokenSymbol: z.string().min(2).max(20),
  stakeAmount: z.number().positive(),
  status: z.string().optional(),
  txHash: z.string().optional()
});

const createTonRoutes = (pool) => {
  // GET /api/ton/plans-summary — Has user any inheritance/storage plans (for reminder widget)
  router.get('/plans-summary', async (req, res) => {
    try {
      if (!pool) return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      const userId = req.userId;
      if (!userId) return sendError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

      const [inh, stor] = await Promise.all([
        pool.query('SELECT 1 FROM ton_inheritance_plans WHERE user_id = $1 LIMIT 1', [userId]),
        pool.query('SELECT 1 FROM ton_storage_plans WHERE user_id = $1 LIMIT 1', [userId])
      ]);
      return res.json({
        ok: true,
        hasInheritance: inh.rowCount > 0,
        hasStorage: stor.rowCount > 0
      });
    } catch (error) {
      console.error('Plans summary error:', error);
      return sendError(res, 500, 'PLANS_FETCH_FAILED', 'Failed to fetch plans');
    }
  });

  router.post('/inheritance', validateBody(inheritanceSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const {
        recipients,
        tokenSymbol,
        totalAmount,
        triggerType,
        txHash
      } = req.body;

      const id = uuidv4();
      await pool.query(
        `INSERT INTO ton_inheritance_plans (
          id, user_id, recipients, token_symbol, total_amount, trigger_type, status, tx_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          userId,
          JSON.stringify(recipients),
          tokenSymbol,
          totalAmount,
          triggerType || 'deadman',
          'draft',
          txHash || null
        ]
      );

      return res.json({ ok: true, id });
    } catch (error) {
      console.error('Create inheritance plan error:', error);
      return sendError(res, 500, 'TON_INHERITANCE_CREATE_FAILED', 'Failed to create inheritance plan');
    }
  });

  router.post('/storage', validateBody(storageSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const {
        letterId,
        storageProvider,
        planType,
        sizeBytes,
        status,
        txHash
      } = req.body;

      const id = uuidv4();
      await pool.query(
        `INSERT INTO ton_storage_plans (
          id, user_id, letter_id, storage_provider, plan_type, size_bytes, status, tx_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          userId,
          letterId || null,
          storageProvider,
          planType || 'permanent',
          sizeBytes || null,
          status || 'pending',
          txHash || null
        ]
      );

      return res.json({ ok: true, id });
    } catch (error) {
      console.error('Create storage plan error:', error);
      return sendError(res, 500, 'TON_STORAGE_CREATE_FAILED', 'Failed to create storage plan');
    }
  });

  router.post('/duel-escrow', validateBody(duelEscrowSchema), async (req, res) => {
    try {
      if (!pool) {
        return sendError(res, 503, 'DB_UNAVAILABLE', 'Database not available');
      }
      const userId = req.userId;
      if (!userId) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'User not authenticated');
      }

      const {
        duelId,
        challengerAddress,
        opponentAddress,
        tokenSymbol,
        stakeAmount,
        status,
        txHash
      } = req.body;

      const id = uuidv4();
      await pool.query(
        `INSERT INTO ton_duel_escrows (
          id, duel_id, user_id, challenger_address, opponent_address, token_symbol, stake_amount, status, tx_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          duelId,
          userId,
          challengerAddress,
          opponentAddress || null,
          tokenSymbol,
          stakeAmount,
          status || 'pending',
          txHash || null
        ]
      );

      return res.json({ ok: true, id });
    } catch (error) {
      console.error('Create duel escrow error:', error);
      return sendError(res, 500, 'TON_DUEL_ESCROW_CREATE_FAILED', 'Failed to create duel escrow');
    }
  });

  return router;
};

module.exports = { createTonRoutes };
