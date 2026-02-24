/**
 * Friend interactions logging (PHASE 5.3)
 * Records gift_sent/received, duel_challenged/won/lost, challenge_created/won/lost between friends.
 */
const logger = require('./logger');

const VALID_TYPES = new Set([
  'gift_sent', 'gift_received',
  'duel_challenged', 'duel_won', 'duel_lost',
  'challenge_created', 'challenge_won', 'challenge_lost', 'challenge_accepted'
]);

/**
 * Check if two users are accepted friends (either direction).
 */
async function areFriends(pool, userId, friendId) {
  if (!pool || !userId || !friendId || userId === friendId) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM friendships 
       WHERE status = 'accepted' 
       AND ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
       LIMIT 1`,
      [userId, friendId]
    );
    return r.rowCount > 0;
  } catch (e) {
    logger.debug('areFriends check failed', { error: e?.message });
    return false;
  }
}

/**
 * Log one interaction row. Fire-and-forget; errors are logged but not thrown.
 */
async function logFriendInteraction(pool, userId, friendId, interactionType, opts = {}) {
  if (!pool || !userId || !friendId || userId === friendId) return;
  if (!VALID_TYPES.has(interactionType)) {
    logger.debug('logFriendInteraction: invalid type', { interactionType });
    return;
  }
  const { targetId, targetType, metadata } = opts;
  try {
    await pool.query(
      `INSERT INTO friend_interactions (user_id, friend_id, interaction_type, target_id, target_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        friendId,
        interactionType,
        targetId || null,
        targetType || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  } catch (e) {
    logger.debug('logFriendInteraction failed', { interactionType, error: e?.message });
  }
}

/**
 * Log gift between two users (only if they are friends). Records both sides.
 */
async function logGiftInteraction(pool, senderId, recipientId, giftId, giftType) {
  const friends = await areFriends(pool, senderId, recipientId);
  if (!friends) return;
  await logFriendInteraction(pool, senderId, recipientId, 'gift_sent', {
    targetId: giftId,
    targetType: 'gift',
    metadata: { giftType }
  });
  await logFriendInteraction(pool, recipientId, senderId, 'gift_received', {
    targetId: giftId,
    targetType: 'gift',
    metadata: { giftType }
  });
}

/**
 * Log duel challenge (challenger -> opponent). Only if opponent_id is a friend.
 */
async function logDuelChallenged(pool, challengerId, opponentId, duelId) {
  if (!opponentId) return;
  const friends = await areFriends(pool, challengerId, opponentId);
  if (!friends) return;
  await logFriendInteraction(pool, challengerId, opponentId, 'duel_challenged', {
    targetId: duelId,
    targetType: 'duel'
  });
}

/**
 * Log duel result (completed). Winner and loser both get a row toward the other.
 */
async function logDuelResult(pool, challengerId, opponentId, loserId, duelId) {
  if (!challengerId || !opponentId || !loserId) return;
  const friends = await areFriends(pool, challengerId, opponentId);
  if (!friends) return;
  const winnerId = loserId === challengerId ? opponentId : challengerId;
  await logFriendInteraction(pool, winnerId, loserId, 'duel_won', {
    targetId: duelId,
    targetType: 'duel'
  });
  await logFriendInteraction(pool, loserId, winnerId, 'duel_lost', {
    targetId: duelId,
    targetType: 'duel'
  });
}

/**
 * Log streak challenge created (challenger -> opponent).
 */
async function logChallengeCreated(pool, challengerId, opponentId, challengeId) {
  if (!opponentId) return;
  const friends = await areFriends(pool, challengerId, opponentId);
  if (!friends) return;
  await logFriendInteraction(pool, challengerId, opponentId, 'challenge_created', {
    targetId: challengeId,
    targetType: 'challenge'
  });
}

/**
 * Log challenge accepted (opponent accepted challenger's challenge).
 */
async function logChallengeAccepted(pool, challengerId, opponentId, challengeId) {
  if (!challengerId || !opponentId) return;
  const friends = await areFriends(pool, challengerId, opponentId);
  if (!friends) return;
  await logFriendInteraction(pool, opponentId, challengerId, 'challenge_accepted', {
    targetId: challengeId,
    targetType: 'challenge'
  });
}

/**
 * Log challenge ended (winner/loser). Call when challenge status becomes completed.
 */
async function logChallengeResult(pool, challengerId, opponentId, winnerId, challengeId) {
  if (!challengerId || !opponentId || !winnerId) return;
  const loserId = winnerId === challengerId ? opponentId : challengerId;
  const friends = await areFriends(pool, challengerId, opponentId);
  if (!friends) return;
  await logFriendInteraction(pool, winnerId, loserId, 'challenge_won', {
    targetId: challengeId,
    targetType: 'challenge'
  });
  await logFriendInteraction(pool, loserId, winnerId, 'challenge_lost', {
    targetId: challengeId,
    targetType: 'challenge'
  });
}

module.exports = {
  areFriends,
  logFriendInteraction,
  logGiftInteraction,
  logDuelChallenged,
  logDuelResult,
  logChallengeCreated,
  logChallengeAccepted,
  logChallengeResult
};
