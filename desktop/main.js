const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 4000;

function startBackendServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'dist', 'index.js');
  console.log('[Desktop Main] Spawning background EchoCast server:', serverPath);

  serverProcess = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: SERVER_PORT.toString() },
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('[Desktop Main] Failed to spawn backend server:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0d14',
    title: 'EchoCast – Synchronized Audio Streaming',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Prevent audio clock throttling when window loses focus
    },
    autoHideMenuBar: true,
  });

  // Load client build or dev server
  const clientDistIndex = path.join(__dirname, '..', 'client', 'dist', 'index.html');
  mainWindow.loadFile(clientDistIndex).catch(() => {
    // If not built yet, fallback to localhost:5173
    mainWindow.loadURL('http://localhost:5173');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Global Media Keys
  globalShortcut.register('MediaPlayPause', () => {
    if (mainWindow) mainWindow.webContents.send('media-key', 'play-pause');
  });
  globalShortcut.register('MediaNextTrack', () => {
    if (mainWindow) mainWindow.webContents.send('media-key', 'next');
  });
  globalShortcut.register('MediaPreviousTrack', () => {
    if (mainWindow) mainWindow.webContents.send('media-key', 'previous');
  });
}

// IPC Handlers
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('open-external', (event, url) => shell.openExternal(url));

app.whenReady().then(() => {
  startBackendServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
