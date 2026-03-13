const Database = require('better-sqlite3');

let db = null;
let databasePath = '';

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

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
// Notes
// ---------------------------------------------------------------------------

function mapNoteRow(row) {
  return {
    id: String(row.id),
    title: String(row.title),
    preview: String(row.preview),
    body: String(row.body),
    sectionId: String(row.section_id),
    isImportant: Boolean(row.is_important),
    createdAt: Number(row.created_at) || Number(row.updated_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now()
  };
}

function listNotes() {
  const rows = db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all();
  return rows.map(mapNoteRow);
}

function getNoteById(noteId) {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  return row ? mapNoteRow(row) : null;
}

function createNote(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const sectionId =
    typeof safePayload.sectionId === 'string' && safePayload.sectionId.trim()
      ? safePayload.sectionId.trim()
      : 'all';
  const body = '<p><br></p>';
  const title = '新建笔记';
  const preview = derivePreview(body);
  const now = Date.now();
  const noteId = `note-${now}-${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO notes (id, title, preview, body, section_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(noteId, title, preview, body, sectionId, now, now);

  const created = getNoteById(noteId);
  if (!created) throw new Error('创建笔记后未读取到结果。');
  return created;
}

function updateNote(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const noteId = typeof safePayload.id === 'string' ? safePayload.id.trim() : '';
  if (!noteId) throw new Error('更新笔记时必须提供有效的 id。');

  const existing = getNoteById(noteId);
  if (!existing) throw new Error(`未找到 id 为 ${noteId} 的笔记。`);

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
  const nextIsImportant =
    typeof safePayload.isImportant === 'boolean'
      ? (safePayload.isImportant ? 1 : 0)
      : (existing.isImportant ? 1 : 0);
  const nextPreview = derivePreview(nextBody);
  const updatedAt = Date.now();

  db.prepare(`
    UPDATE notes SET title = ?, preview = ?, body = ?, section_id = ?, is_important = ?, updated_at = ?
    WHERE id = ?
  `).run(nextTitle, nextPreview, nextBody, nextSectionId, nextIsImportant, updatedAt, noteId);

  const updated = getNoteById(noteId);
  if (!updated) throw new Error('更新笔记后未读取到结果。');
  return updated;
}

function deleteNote(noteId) {
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function mapSectionRow(row) {
  return {
    id: String(row.id),
    label: String(row.label),
    sortOrder: Number(row.sort_order) || 0,
    createdAt: Number(row.created_at) || Date.now(),
  };
}

function listSections() {
  const rows = db.prepare('SELECT * FROM sections ORDER BY sort_order ASC, created_at ASC').all();
  return rows.map(mapSectionRow);
}

function createSection(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const label = typeof safePayload.label === 'string' && safePayload.label.trim()
    ? safePayload.label.trim()
    : '新分类';
  const now = Date.now();
  const id = `section-${now}-${Math.random().toString(36).slice(2, 8)}`;

  const maxRow = db.prepare('SELECT MAX(sort_order) AS max_order FROM sections').get();
  const sortOrder = (Number(maxRow?.max_order) || 0) + 1;

  db.prepare('INSERT INTO sections (id, label, sort_order, created_at) VALUES (?, ?, ?, ?)').run(id, label, sortOrder, now);

  const row = db.prepare('SELECT * FROM sections WHERE id = ?').get(id);
  return mapSectionRow(row);
}

function updateSection(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const id = typeof safePayload.id === 'string' ? safePayload.id.trim() : '';
  if (!id) throw new Error('更新分类时必须提供有效的 id。');

  const sets = [];
  const params = [];

  if (typeof safePayload.label === 'string' && safePayload.label.trim()) {
    sets.push('label = ?');
    params.push(safePayload.label.trim());
  }
  if (typeof safePayload.sortOrder === 'number' && Number.isFinite(safePayload.sortOrder)) {
    sets.push('sort_order = ?');
    params.push(Math.trunc(safePayload.sortOrder));
  }
  if (sets.length === 0) throw new Error('没有需要更新的字段。');

  params.push(id);
  db.prepare(`UPDATE sections SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const row = db.prepare('SELECT * FROM sections WHERE id = ?').get(id);
  if (!row) throw new Error(`未找到 id 为 ${id} 的分类。`);
  return mapSectionRow(row);
}

function deleteSection(sectionId) {
  const migrate = db.transaction(() => {
    db.prepare("UPDATE notes SET section_id = 'all' WHERE section_id = ?").run(sectionId);
    db.prepare('DELETE FROM sections WHERE id = ?').run(sectionId);
  });
  migrate();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

const defaultNotes = [];

function initialize(dbPath) {
  databasePath = dbPath;
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
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

  const columns = db.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  if (!columns.includes('created_at')) {
    db.exec('ALTER TABLE notes ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;');
    db.exec('UPDATE notes SET created_at = updated_at WHERE created_at = 0;');
  }
  if (!columns.includes('is_important')) {
    db.exec('ALTER TABLE notes ADD COLUMN is_important INTEGER NOT NULL DEFAULT 0;');
    db.exec("UPDATE notes SET is_important = 1, section_id = 'all' WHERE section_id = 'important';");
  }

  const { total } = db.prepare('SELECT COUNT(1) AS total FROM notes').get();

  if (total > 0) {
    return;
  }

  if (defaultNotes.length === 0) {
    return;
  }

  const insertNote = db.prepare(`
    INSERT INTO notes (id, title, preview, body, section_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    for (const note of defaultNotes) {
      const body = ensureHtmlDocument(note.body);
      const preview = derivePreview(body);
      const createdAt = note.createdAt ?? note.updatedAt;
      insertNote.run(note.id, note.title, preview, body, note.sectionId, createdAt, note.updatedAt);
    }
  });
  seed();
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
