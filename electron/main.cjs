const { app, BrowserWindow, dialog, ipcMain, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {
  audioExtensionPattern,
  collectAudioFilesFromSelection,
  listAudioFiles,
  readSidecarArtwork,
  readSidecarLyrics,
} = require('./music-library.cjs');
const { searchSongs, downloadSong, withRequestHeaders } = require('./fangpi-source.cjs');

function createWindow() {
  const window = new BrowserWindow({
    width: 420,
    height: 820,
    minWidth: 360,
    minHeight: 620,
    backgroundColor: '#101114',
    frame: false,
    icon: path.join(__dirname, '..', 'assets', 'brand', 'teamusic-icon.png'),
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

function resolvedLibraryPath() {
  return path.join(app.getPath('music'), 'TeaMusic', 'Archive');
}

function legacyResolvedLibraryPath() {
  return path.join(app.getPath('music'), 'TeaMusic', 'Resolved');
}

function normalizeFangpiUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.hostname !== 'www.fangpi.net') {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function formatCookieHeader(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function fangpiRequestHeaders() {
  const cookies = await session.defaultSession.cookies.get({ url: 'https://www.fangpi.net' });
  const cookieHeader = formatCookieHeader(cookies);
  return cookieHeader ? { Cookie: cookieHeader } : {};
}

ipcMain.handle('fangpi:search', async (_event, query) => {
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery) {
    return [];
  }

  try {
    return await searchSongs(normalizedQuery);
  } catch {
    return [];
  }
});

ipcMain.handle('fangpi:download', async (_event, musicId) => {
  const id = String(musicId || '').trim();

  if (!id) {
    return { error: '缺少歌曲 ID' };
  }

  const outputDir = resolvedLibraryPath();
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    const requestHeaders = await fangpiRequestHeaders();
    const deps = Object.keys(requestHeaders).length > 0 ? withRequestHeaders(requestHeaders) : undefined;
    return await downloadSong(id, outputDir, deps);
  } catch (error) {
    if (error && error.code === 'VERIFY_REQUIRED' && error.verifyUrl) {
      return { error: error.message, code: error.code, verifyUrl: error.verifyUrl };
    }

    return { error: error instanceof Error ? error.message : '下载失败' };
  }
});

ipcMain.handle('fangpi:verify', async (event, rawUrl) => {
  const verificationUrl = normalizeFangpiUrl(rawUrl);

  if (!verificationUrl) {
    return false;
  }

  const parentWindow = BrowserWindow.fromWebContents(event.sender);

  return new Promise((resolve) => {
    const verifyWindow = new BrowserWindow({
      width: 520,
      height: 720,
      minWidth: 420,
      minHeight: 560,
      title: 'TeaMusic 真人检测',
      parent: parentWindow || undefined,
      modal: Boolean(parentWindow),
      backgroundColor: '#101114',
      icon: path.join(__dirname, '..', 'assets', 'brand', 'teamusic-icon.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    let isSettled = false;

    function settle(value) {
      if (isSettled) {
        return;
      }

      isSettled = true;
      resolve(value);
    }

    verifyWindow.webContents.setWindowOpenHandler(({ url }) => {
      const nextUrl = normalizeFangpiUrl(url);

      if (nextUrl) {
        void verifyWindow.loadURL(nextUrl.href);
      }

      return { action: 'deny' };
    });
    verifyWindow.on('closed', () => settle(true));
    verifyWindow.loadURL(verificationUrl.href).catch(() => {
      if (!verifyWindow.isDestroyed()) {
        verifyWindow.close();
      }

      settle(false);
    });
  });
});

ipcMain.handle('musicol:scan-resolved', async () => {
  return Array.from(new Set([...listAudioFiles(resolvedLibraryPath()), ...listAudioFiles(legacyResolvedLibraryPath())]));
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
