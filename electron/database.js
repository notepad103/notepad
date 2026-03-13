const { execFileSync } = require('node:child_process');

let databasePath = '';

const defaultNotes = [];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureHtmlDocument(body) {
  const content = String(body ?? '').trim();

  if (!content) {
    return '<p><br></p>';
  }

  if (/<\s*\/?(p|h1|h2|h3|ul|ol|li|blockquote|strong|em|code|br)\b/i.test(content)) {
    return content;
  }

  const escaped = escapeHtml(content).replace(/\r?\n/g, '<br>');
  return `<p>${escaped}</p>`;
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function quoteText(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toSqlNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return String(Date.now());
}

function deriveTitle(body, fallback = '未命名笔记') {
  const firstLine = stripHtml(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return fallback;
  }

  return firstLine.length > 30 ? `${firstLine.slice(0, 30)}...` : firstLine;
}

function derivePreview(body) {
  const plain = stripHtml(body).replace(/\s+/g, ' ').trim();

  if (!plain) {
    return '点击开始记录...';
  }

  return plain.length > 52 ? `${plain.slice(0, 52)}...` : plain;
}

// ---------------------------------------------------------------------------
// SQLite helpers
// ---------------------------------------------------------------------------

function runSql(sql, { json = false } = {}) {
  if (!databasePath) {
    throw new Error('SQLite 数据库尚未初始化。');
  }

  const args = [];

  if (json) {
    args.push('-json');
  }

  args.push(databasePath, sql);

  try {
    return execFileSync('sqlite3', args, {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`执行 SQLite 命令失败: ${message}`);
  }
}

function queryRows(sql) {
  const output = runSql(sql, { json: true }).trim();

  if (!output) {
    return [];
  }

  return JSON.parse(output);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function mapNoteRow(row) {
  return {
    id: String(row.id),
    title: String(row.title),
    preview: String(row.preview),
    body: String(row.body),
    sectionId: String(row.sectionId),
    createdAt: Number(row.createdAt) ?? Number(row.updatedAt) ?? Date.now(),
    updatedAt: Number(row.updatedAt) || Date.now()
  };
}

function listNotes() {
  const rows = queryRows(`
    SELECT
      id,
      title,
      preview,
      body,
      section_id AS sectionId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM notes
    ORDER BY updated_at DESC;
  `);

  return rows.map(mapNoteRow);
}

function getNoteById(noteId) {
  const safeNoteId = quoteText(noteId);
  const rows = queryRows(`
    SELECT
      id,
      title,
      preview,
      body,
      section_id AS sectionId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM notes
    WHERE id = ${safeNoteId}
    LIMIT 1;
  `);

  if (rows.length === 0) {
    return null;
  }

  return mapNoteRow(rows[0]);
}

function createNote(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const sectionId =
    typeof safePayload.sectionId === 'string' && safePayload.sectionId.trim() ? safePayload.sectionId.trim() : 'all';
  const body = '<p><br></p>';
  const title = '新建笔记';
  const preview = derivePreview(body);
  const createdAt = Date.now();
  const updatedAt = createdAt;
  const noteId = `note-${updatedAt}-${Math.random().toString(36).slice(2, 8)}`;

  runSql(`
    INSERT INTO notes (
      id,
      title,
      preview,
      body,
      section_id,
      created_at,
      updated_at
    ) VALUES (
      ${quoteText(noteId)},
      ${quoteText(title)},
      ${quoteText(preview)},
      ${quoteText(body)},
      ${quoteText(sectionId)},
      ${toSqlNumber(createdAt)},
      ${toSqlNumber(updatedAt)}
    );
  `);

  const created = getNoteById(noteId);

  if (!created) {
    throw new Error('创建笔记后未读取到结果。');
  }

  return created;
}

function updateNote(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const noteId = typeof safePayload.id === 'string' ? safePayload.id.trim() : '';

  if (!noteId) {
    throw new Error('更新笔记时必须提供有效的 id。');
  }

  const existing = getNoteById(noteId);

  if (!existing) {
    throw new Error(`未找到 id 为 ${noteId} 的笔记。`);
  }

  const rawBody = typeof safePayload.body === 'string' ? safePayload.body : existing.body;
  const nextBody = ensureHtmlDocument(rawBody);
  const nextSectionId =
    typeof safePayload.sectionId === 'string' && safePayload.sectionId.trim()
      ? safePayload.sectionId.trim()
      : existing.sectionId;
  const nextTitle =
    typeof safePayload.title === 'string' && safePayload.title.trim()
      ? safePayload.title.trim()
      : deriveTitle(nextBody, existing.title);
  const nextPreview = derivePreview(nextBody);
  const updatedAt = Date.now();

  runSql(`
    UPDATE notes
    SET
      title = ${quoteText(nextTitle)},
      preview = ${quoteText(nextPreview)},
      body = ${quoteText(nextBody)},
      section_id = ${quoteText(nextSectionId)},
      updated_at = ${toSqlNumber(updatedAt)}
    WHERE id = ${quoteText(noteId)};
  `);

  const updated = getNoteById(noteId);

  if (!updated) {
    throw new Error('更新笔记后未读取到结果。');
  }

  return updated;
}

function deleteNote(noteId) {
  const safeNoteId = quoteText(noteId);
  runSql(`DELETE FROM notes WHERE id = ${safeNoteId};`);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function mapSectionRow(row) {
  return {
    id: String(row.id),
    label: String(row.label),
    sortOrder: Number(row.sortOrder) || 0,
    createdAt: Number(row.createdAt) || Date.now(),
  };
}

function listSections() {
  const rows = queryRows(`
    SELECT id, label, sort_order AS sortOrder, created_at AS createdAt
    FROM sections
    ORDER BY sort_order ASC, created_at ASC;
  `);
  return rows.map(mapSectionRow);
}

function createSection(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const label = typeof safePayload.label === 'string' && safePayload.label.trim()
    ? safePayload.label.trim()
    : '新分类';
  const now = Date.now();
  const id = `section-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const maxRows = queryRows('SELECT MAX(sort_order) AS maxOrder FROM sections;');
  const sortOrder = (Number(maxRows[0]?.maxOrder) || 0) + 1;

  runSql(`
    INSERT INTO sections (id, label, sort_order, created_at)
    VALUES (${quoteText(id)}, ${quoteText(label)}, ${toSqlNumber(sortOrder)}, ${toSqlNumber(now)});
  `);

  const rows = queryRows(`
    SELECT id, label, sort_order AS sortOrder, created_at AS createdAt
    FROM sections WHERE id = ${quoteText(id)};
  `);
  return mapSectionRow(rows[0]);
}

function updateSection(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const id = typeof safePayload.id === 'string' ? safePayload.id.trim() : '';
  if (!id) throw new Error('更新分类时必须提供有效的 id。');

  const sets = [];
  if (typeof safePayload.label === 'string' && safePayload.label.trim()) {
    sets.push(`label = ${quoteText(safePayload.label.trim())}`);
  }
  if (typeof safePayload.sortOrder === 'number' && Number.isFinite(safePayload.sortOrder)) {
    sets.push(`sort_order = ${toSqlNumber(safePayload.sortOrder)}`);
  }
  if (sets.length === 0) throw new Error('没有需要更新的字段。');

  runSql(`UPDATE sections SET ${sets.join(', ')} WHERE id = ${quoteText(id)};`);

  const rows = queryRows(`
    SELECT id, label, sort_order AS sortOrder, created_at AS createdAt
    FROM sections WHERE id = ${quoteText(id)};
  `);
  if (rows.length === 0) throw new Error(`未找到 id 为 ${id} 的分类。`);
  return mapSectionRow(rows[0]);
}

function deleteSection(sectionId) {
  runSql(`UPDATE notes SET section_id = 'all' WHERE section_id = ${quoteText(sectionId)};`);
  runSql(`DELETE FROM sections WHERE id = ${quoteText(sectionId)};`);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function initialize(dbPath) {
  databasePath = dbPath;

  runSql(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      preview TEXT NOT NULL,
      body TEXT NOT NULL,
      section_id TEXT NOT NULL DEFAULT 'all',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  try {
    runSql('ALTER TABLE notes ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;');
    runSql('UPDATE notes SET created_at = updated_at WHERE created_at = 0;');
  } catch (_) {
    /* 列已存在，跳过迁移 */
  }

  const countRows = queryRows('SELECT COUNT(1) AS total FROM notes;');
  const total = Number(countRows[0]?.total ?? 0);

  if (total > 0) {
    return;
  }

  const seedStatements = defaultNotes
    .map((note) => {
      const title = note.title;
      const body = ensureHtmlDocument(note.body);
      const preview = derivePreview(body);

      const createdAt = note.createdAt ?? note.updatedAt;
      return `
        INSERT INTO notes (
          id,
          title,
          preview,
          body,
          section_id,
          created_at,
          updated_at
        ) VALUES (
          ${quoteText(note.id)},
          ${quoteText(title)},
          ${quoteText(preview)},
          ${quoteText(body)},
          ${quoteText(note.sectionId)},
          ${toSqlNumber(createdAt)},
          ${toSqlNumber(note.updatedAt)}
        );
      `;
    })
    .join('\n');

  if (seedStatements.trim()) {
    runSql(`
      BEGIN TRANSACTION;
      ${seedStatements}
      COMMIT;
    `);
  }
}

function getDatabasePath() {
  return databasePath;
}

module.exports = {
  initialize,
  getDatabasePath,
  listNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  listSections,
  createSection,
  updateSection,
  deleteSection,
};
