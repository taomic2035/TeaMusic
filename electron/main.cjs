const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  audioExtensionPattern,
  collectAudioFilesFromSelection,
  listAudioFiles,
  readSidecarArtwork,
  readSidecarLyrics,
} = require('./music-library.cjs');

const MUSICOL_DIR = process.env.MUSICOL_DIR || '/Users/taomic/musicol';
const DOWNLOADER_PATH = path.join(MUSICOL_DIR, 'downloader.js');

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 640,
    minHeight: 560,
    backgroundColor: '#101114',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    visualEffectState: 'active',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function localLibraryPath() {
  return path.join(app.getPath('userData'), 'local-library.json');
}

function readLocalLibrary() {
  try {
    const parsed = JSON.parse(fs.readFileSync(localLibraryPath(), 'utf8'));
    return Array.isArray(parsed?.files) ? parsed.files.filter((filePath) => typeof filePath === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocalLibrary(filePaths) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(localLibraryPath(), JSON.stringify({ files: filePaths }, null, 2));
}

function addToLocalLibrary(filePaths) {
  const merged = Array.from(new Set([...readLocalLibrary(), ...filePaths])).filter((filePath) => audioExtensionPattern.test(filePath));
  writeLocalLibrary(merged);
  return merged;
}

function removeFromLocalLibrary(filePath) {
  const normalizedPath = String(filePath || '');
  const remaining = readLocalLibrary().filter((storedPath) => storedPath !== normalizedPath);
  writeLocalLibrary(remaining);
  return remaining;
}

ipcMain.handle('musicol:resolve', async (_event, query) => {
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery) {
    throw new Error('曲库补全需要关键词');
  }

  if (!fs.existsSync(DOWNLOADER_PATH)) {
    throw new Error(`没有找到 musicol downloader: ${DOWNLOADER_PATH}`);
  }

  const outputDir = path.join(app.getPath('music'), 'TeaMusic', 'Resolved');
  fs.mkdirSync(outputDir, { recursive: true });
  const before = new Set(listAudioFiles(outputDir));

  return new Promise((resolve, reject) => {
    const child = spawn('node', [DOWNLOADER_PATH, '--keyword', normalizedQuery, '--limit', '1', '--out', outputDir], {
      cwd: MUSICOL_DIR,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const files = listAudioFiles(outputDir).filter((filePath) => !before.has(filePath));

      if (code !== 0) {
        reject(new Error(stderr || stdout || `musicol exited with ${code}`));
        return;
      }

      resolve({
        files,
        outputDir,
        stdout,
      });
    });
  });
});

ipcMain.handle('musicol:scan-resolved', async () => {
  const outputDir = path.join(app.getPath('music'), 'TeaMusic', 'Resolved');
  return listAudioFiles(outputDir);
});

ipcMain.handle('musicol:scan-local', async () => {
  return readLocalLibrary().filter((filePath) => fs.existsSync(filePath) && audioExtensionPattern.test(filePath));
});

ipcMain.handle('musicol:choose-local', async () => {
  const result = await dialog.showOpenDialog({
    title: '添加本地音乐',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [
      { name: '音频文件', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'aif', 'aiff', 'alac'] },
      { name: '全部文件', extensions: ['*'] },
    ],
  });

  if (result.canceled) {
    return [];
  }

  return addToLocalLibrary(collectAudioFilesFromSelection(result.filePaths));
});

ipcMain.handle('musicol:remove-local', async (_event, filePath) => {
  return removeFromLocalLibrary(filePath);
});

ipcMain.handle('musicol:reveal-local', async (_event, filePath) => {
  const normalizedPath = String(filePath || '');

  if (!normalizedPath || !fs.existsSync(normalizedPath)) {
    return false;
  }

  shell.showItemInFolder(normalizedPath);
  return true;
});

ipcMain.handle('musicol:read-lyrics', async (_event, filePath) => {
  return readSidecarLyrics(filePath);
});

ipcMain.handle('musicol:read-artwork', async (_event, filePath) => {
  return readSidecarArtwork(filePath);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
