const normalizeLetter = (row) => ({
  id: row.id,
  title: row.title,
  content: row.content,
  recipients: row.recipients || [],
  unlockDate: row.unlock_date?.toISOString(),
  status: row.status,
  attachments: row.attachments || [],
  type: row.letter_type,
  options: row.options || {},
  isFavorite: row.is_favorite || false
});

module.exports = { normalizeLetter };
