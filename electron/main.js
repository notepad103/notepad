const path = require('node:path');
const { spawn } = require('node:child_process');

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
const db = require('./database');

const isMac = process.platform === 'darwin';
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function registerIpcHandlers() {
  ipcMain.handle('notes:list', () => db.listNotes());
  ipcMain.handle('notes:create', (_event, payload) => db.createNote(payload));
  ipcMain.handle('notes:update', (_event, payload) => db.updateNote(payload));
  ipcMain.handle('notes:delete', (_event, id) => db.deleteNote(id));
  ipcMain.handle('notes:storage-path', () => db.getDatabasePath());
  ipcMain.handle('sections:list', () => db.listSections());
  ipcMain.handle('sections:create', (_event, payload) => db.createSection(payload));
  ipcMain.handle('sections:update', (_event, payload) => db.updateSection(payload));
  ipcMain.handle('sections:delete', (_event, id) => db.deleteSection(id));
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 禁止 Cmd+Option+I 打开开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key.toLowerCase() === 'i' && input.meta && input.alt) {
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // 页面加载完成后再打开 DevTools；每次刷新后重新打开，避免「连接已断开」
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  if (isMac) {
    const iconPath = path.join(__dirname, '..', 'icon.png');
    try {
      app.dock.setIcon(iconPath);
    } catch (_) {}
  }
  db.initialize(path.join(app.getPath('userData'), 'notes.db'));
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
