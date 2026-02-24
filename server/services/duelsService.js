const normalizeDuel = (row) => ({
  id: row.id,
  title: row.title,
  stake: row.stake,
  opponent: row.opponent_name || (row.opponent_id ? row.opponent_id.toString() : ''),
  status: row.status,
  deadline: row.deadline?.toISOString(),
  isPublic: row.is_public,
  isTeam: row.is_team || !!(row.challenger_team_id || row.opponent_team_id),
  witnessCount: row.witness_count || 0,
  viewsCount: row.views_count || 0,
  lastViewedAt: row.last_viewed_at?.toISOString(),
  loser: row.loser_id ? row.loser_id.toString() : undefined,
  isFavorite: row.is_favorite || false,
  challengerId: row.challenger_id,
  opponentId: row.opponent_id,
  challengerTeamId: row.challenger_team_id || undefined,
  opponentTeamId: row.opponent_team_id || undefined,
  winnerTauntMessage: row.winner_taunt_message || undefined
});

module.exports = { normalizeDuel };
