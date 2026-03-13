const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

let electron = require('electron');

// When ELECTRON_RUN_AS_NODE is set (e.g. in Cursor/VS Code integrated terminal),
// require('electron') returns the npm package (executable path string), not the app API.
// Re-launch the real Electron binary with ELECTRON_RUN_AS_NODE unset. Only retry once to avoid loops.
if (typeof electron === 'string' && !process.env.NOTEPAD_ELECTRON_REEXEC) {
  const appRoot = path.join(__dirname, '..');
  const env = { ...process.env, NOTEPAD_ELECTRON_REEXEC: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ['.'], { env, stdio: 'inherit', cwd: appRoot, windowsHide: false });
  child.on('close', (code, signal) => process.exit(code != null ? code : 1));
  process.exit(0);
}
if (!electron || !electron.app) {
  console.error(
    'electron/main.js must be run as the Electron main process.\n' +
    'Do not run with node. Use: npx electron . (from project root)'
  );
  process.exit(1);
}

const { app, BrowserWindow, ipcMain, Notification } = electron;
const isMac = process.platform === 'darwin';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let databasePath = '';

const defaultNotes = [
  {
    id: 'note-1',
    title: '本周产品记录',
    body: '本周我们在两个用户分组中验证了引导文案方案。通过更明确的动作词与减少打断弹窗，转化率提升了 6.4%。下一步将这些改动合并进候选发布版本。',
    sectionId: 'today',
    updatedAt: Date.now() - 1000 * 60 * 60 * 2
  },
  {
    id: 'note-2',
    title: '客户反馈摘要',
    body: '客户希望更容易通过键盘访问置顶笔记、获得更清晰的同步状态提示，并在编辑模式中减少视觉干扰。建议将同步状态移到底部悬浮面板。',
    sectionId: 'important',
    updatedAt: Date.now() - 1000 * 60 * 60 * 20
  },
  {
    id: 'note-3',
    title: '研究摘录',
    body: 'Apple HIG 更强调内容优先，窗口装饰应尽量克制。建议过渡动画控制在 250ms 以内，同时保持导航区与编辑区之间稳定的层级关系。',
    sectionId: 'all',
    updatedAt: Date.now() - 1000 * 60 * 60 * 48
  },
  {
    id: 'note-4',
    title: '归档：v0 线框稿',
    body: '归档早期方案：分栏布局配合检查器式控制面板。现已替换为更简洁的笔记优先工作流，并压缩侧边栏操作密度。',
    sectionId: 'archive',
    updatedAt: Date.now() - 1000 * 60 * 60 * 240
  }
];

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

function initializeDatabase() {
  databasePath = path.join(app.getPath('userData'), 'notes.db');

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

  runSql(`
    BEGIN TRANSACTION;
    ${seedStatements}
    COMMIT;
  `);
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

function registerIpcHandlers() {
  ipcMain.handle('notes:list', () => listNotes());
  ipcMain.handle('notes:create', (_event, payload) => createNote(payload));
  ipcMain.handle('notes:update', (_event, payload) => updateNote(payload));
  ipcMain.handle('notes:delete', (_event, id) => deleteNote(id));
  ipcMain.handle('notes:storage-path', () => databasePath);
  ipcMain.handle('show-notification', (_event, { title = 'Notepad', body } = {}) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    // hasShadow: false, // 隐藏窗口阴影，避免看起来像边框
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  initializeDatabase();
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
