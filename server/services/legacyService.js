const normalizeLegacyItem = (row) => ({
  id: row.id,
  type: row.item_type,
  title: row.title,
  description: row.description || '',
  secretPayload: row.encrypted_payload || undefined,
  severity: row.severity || undefined,
  rarity: row.rarity || undefined,
  isResolved: row.is_resolved || false,
  createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
  ghostConfig: row.ghost_config || undefined,
  isFavorite: row.is_favorite || false
});

module.exports = { normalizeLegacyItem };
