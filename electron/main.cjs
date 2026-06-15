const { app, BrowserWindow, dialog, ipcMain, shell, session, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFile, execSync } = require('node:child_process');
const {
  audioExtensionPattern,
  collectAudioFilesFromSelection,
  listAudioFiles,
  readSidecarArtwork,
  readSidecarLyrics,
} = require('./music-library.cjs');
const { searchSongs, downloadSong, resolveExternalDownloadPage, isVerificationChallenge, VerificationRequiredError } = require('./fangpi-source.cjs');
const { ARCHIVE_ID_PREFIX, searchArchiveSongs, downloadArchiveSong } = require('./internet-archive-source.cjs');
const { waitForBrowserDownload } = require('./browser-download-import.cjs');

// 必须与验证窗口、worker 窗口三处一致。Cloudflare 把 cf_clearance 绑死在解题时的 UA 上。
// 用不含 "Electron" 的普通 Chrome UA，且 Chrome 版本取真实 Chromium 版本——避免"UA 说 Chrome X，
// TLS 指纹却是 Chromium Y"的不可能组合被 CF 当机器人。
const FANGPI_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
const FANGPI_TIMEOUT = 50000;
// 留足人工点一下 Turnstile 的时间（CF 这道实测无法自动解，必须真人交互）。
const VERIFY_TIMEOUT = 300000;

// 在线找歌诊断日志：终端可见 + 落盘到 tmp/fangpi.log（便于事后读取定位 Cloudflare 验证是否持久化）。
const FANGPI_LOG_PATH = path.join(__dirname, '..', 'tmp', 'fangpi.log');
function flog(...args) {
  const line = args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
  console.log('[fangpi]', line);
  try {
    fs.mkdirSync(path.dirname(FANGPI_LOG_PATH), { recursive: true });
    fs.appendFileSync(FANGPI_LOG_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* 落盘失败不影响功能 */
  }
}

// 真实的 fangpi 内容页（非 cdn-cgi 挑战中转）。验证"已放行"的权威判据之一。
function isFangpiContentUrl(rawUrl) {
  const value = String(rawUrl || '');
  return /^https?:\/\/(www\.)?fangpi\.net\//i.test(value) && !/\/cdn-cgi\//i.test(value);
}

// 打印当前 session 里 fangpi 的 cf_clearance 是否存在——直接判定"验证有没有留下可复用凭证"。
async function logClearance(tag) {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: 'https://www.fangpi.net' });
    const clearance = cookies.find((cookie) => cookie.name === 'cf_clearance');
    flog(tag, 'cf_clearance:', clearance ? 'PRESENT' : 'MISSING', '| cookies:', cookies.map((cookie) => cookie.name).join(',') || '(none)');
  } catch (error) {
    flog(tag, 'cookie check error', error && error.message);
  }
}

function encodeForm(data) {
  return Object.entries(data || {})
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

// ── Chrome cookie 提取：通过 Chrome DevTools Protocol (CDP) 从 Chrome 浏览器提取 cf_clearance ──
// Electron 内 Turnstile 因 STUN DNS 失败无法完成验证，改用系统 Chrome 浏览器验证，
// 然后通过 CDP 提取 cf_clearance，注入到 Electron session。
// Chrome cookie 数据库被锁无法直接读取，CDP 是唯一可靠的提取方式。

const CDP_PORT = 19222;
const CHROME_CDP_SCRIPT = path.join(__dirname, 'chrome-cdp-cookie.py');

// 通过 Python + CDP 从 Chrome 提取 cf_clearance
function extractChromeCfClearance() {
  try {
    const result = execSync(`python "${CHROME_CDP_SCRIPT}" get-cookie ${CDP_PORT}`, {
      encoding: 'utf8',
      timeout: 10000,
    }).trim();

    if (result === 'NOT_FOUND' || result === 'NO_CDP') return null;

    // 格式: CF_CLEARANCE|value|expires|path|domain|secure|httpOnly|sameSite
    const parts = result.split('|');
    if (parts[0] !== 'CF_CLEARANCE' || parts.length < 8) return null;

    return {
      value: parts[1],
      expires: Number(parts[2]),
      path: parts[3],
      domain: parts[4],
      secure: parts[5] === 'True',
      httpOnly: parts[6] === 'True',
      sameSite: parts[7],
    };
  } catch (e) {
    flog('Chrome CDP cookie extraction failed:', e.message);
    return null;
  }
}

// 检查 Chrome CDP 是否可用
function isChromeCDPAvailable() {
  try {
    const result = execSync(`python "${CHROME_CDP_SCRIPT}" check ${CDP_PORT}`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    return result === 'CDP_OK';
  } catch {
    return false;
  }
}

async function openExistingChromeVerification(url) {
  if (isChromeCDPAvailable()) {
    flog('  navigating existing Chrome CDP on port', CDP_PORT);
    await navigateChromeCDPAsync(url);
    return 'cdp';
  }

  flog('  Chrome CDP unavailable; opening verification URL in existing default browser');
  await shell.openExternal(url);
  return 'external';
}

// 通过 CDP 让 Chrome 导航到指定 URL（异步，不阻塞事件循环）
function navigateChromeCDPAsync(url) {
  return new Promise((resolve) => {
    execFile('python', [CHROME_CDP_SCRIPT, 'navigate', url, String(CDP_PORT)], { timeout: 15000 }, (err) => {
      if (err) flog('  Chrome CDP navigate failed:', err.message);
      resolve(!err);
    });
  });
}

// 通过 CDP 从 Chrome 获取当前页面 HTML 内容（异步，不阻塞事件循环）
function getCdpPageContentAsync() {
  return new Promise((resolve) => {
    execFile('python', [CHROME_CDP_SCRIPT, 'get-html', String(CDP_PORT)], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        flog('  Chrome CDP get-html failed:', err.message);
        resolve(null);
        return;
      }
      const result = stdout.trim();
      if (result === 'NO_CDP' || result === 'NO_PAGE' || result === 'ERROR') {
        resolve(null);
        return;
      }
      resolve(result);
    });
  });
}

// 通过 CDP 在 Chrome 页面内执行 fetch（异步，不阻塞事件循环）
function cdpFetchAsync(url, method, body) {
  return new Promise((resolve) => {
    execFile('python', [CHROME_CDP_SCRIPT, 'fetch', url, method, body || '', String(CDP_PORT)], { timeout: FANGPI_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        flog('  Chrome CDP fetch failed:', err.message);
        resolve(null);
        return;
      }
      const result = stdout.trim();
      if (result === 'NO_CDP' || result === 'NO_PAGE' || result === 'FETCH_ERROR') {
        resolve(null);
        return;
      }
      resolve(result);
    });
  });
}

// 将 cf_clearance 注入 Electron session
async function injectCfClearance(cookieInfo) {
  const expires = cookieInfo.expires > 0 ? cookieInfo.expires : Math.floor(Date.now() / 1000) + 86400;
  await session.defaultSession.cookies.set({
    url: 'https://www.fangpi.net',
    name: 'cf_clearance',
    value: cookieInfo.value,
    domain: cookieInfo.domain || '.fangpi.net',
    path: cookieInfo.path || '/',
    secure: cookieInfo.secure !== false,
    httpOnly: cookieInfo.httpOnly !== false,
    sameSite: cookieInfo.sameSite === 'None' ? 'no_restriction' : cookieInfo.sameSite === 'Lax' ? 'lax' : 'strict',
    expirationDate: expires,
  });
}

// ── fangpi 请求传输：用真实隐藏 BrowserWindow（Chromium 渲染器）发起，而非主进程 net ──
// 实测：net 的 TLS 指纹(JA4 t13d1516h2)与 BrowserWindow(t13d1517h2)不同；Cloudflare 每个请求都重校验
// TLS 指纹，所以验证窗口解出的 cf_clearance 在 net 上会被重新挑战（同机同 IP 同 UA 也没用）。隐藏 worker
// 窗口用浏览器 TLS、与验证窗口同 session 同 UA → cf_clearance 才被接受。GET 用导航读 HTML，POST 用页内 fetch。
let fangpiWorker = null;

function getFangpiWorker() {
  if (fangpiWorker && !fangpiWorker.isDestroyed()) {
    return fangpiWorker;
  }

  fangpiWorker = new BrowserWindow({
    show: false,
    width: 480,
    height: 760,
    title: '真人检测 · TeaMusic',
    icon: path.join(__dirname, '..', 'assets', 'brand', 'teamusic-icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  fangpiWorker.webContents.setUserAgent(FANGPI_UA);
  fangpiWorker.on('closed', () => {
    fangpiWorker = null;
  });
  return fangpiWorker;
}

// 串行化 worker 操作：单个浏览器一次只能导航到一个页面，并发会互相打断。
let workerChain = Promise.resolve();
function runOnWorker(task) {
  const result = workerChain.then(task, task);
  workerChain = result.then(
    () => {},
    () => {},
  );
  return result;
}

// 导航 worker 到 url，返回 { status, html }。403/503 也算"加载完成"（CF 拦截页会渲染）。
function workerLoad(worker, url) {
  const wc = worker.webContents;
  return new Promise((resolve, reject) => {
    let status = 0;
    const onNavigate = (_event, _url, code) => {
      if (code) status = code;
    };
    const onFinish = () => {
      wc.executeJavaScript('document.documentElement.outerHTML', true).then(
        (html) => {
          cleanup();
          resolve({ status, html: String(html || '') });
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    };
    const onFail = (_event, errorCode, errorDesc, _validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      cleanup();
      reject(new Error(`加载失败 ${errorCode} ${errorDesc}`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('请求超时'));
    }, FANGPI_TIMEOUT);
    function cleanup() {
      clearTimeout(timer);
      wc.removeListener('did-navigate', onNavigate);
      wc.removeListener('did-finish-load', onFinish);
      wc.removeListener('did-fail-load', onFail);
    }
    wc.on('did-navigate', onNavigate);
    wc.on('did-finish-load', onFinish);
    wc.on('did-fail-load', onFail);
    wc.loadURL(url).catch(() => {
      /* HTTP 错误码不会 reject loadURL；网络级失败由 did-fail-load 处理 */
    });
  });
}

// httpGet：导航取整页 HTML。
// 优先用 Electron worker（快），如果被 CF 拦截则回退到 Chrome CDP（可靠）。
// 一旦 Chrome CDP 可用，后续请求直接走 CDP 跳过 Electron（避免每次都 403 再回退）。
let chromeCdpVerified = false;

function workerGet(url) {
  return runOnWorker(async () => {
    // 如果 Chrome CDP 已验证可用，直接走 CDP（避免 Electron 403 再回退的开销）
    if (chromeCdpVerified && isChromeCDPAvailable()) {
      flog('GET (CDP)', url.slice(0, 70));
      await navigateChromeCDPAsync(url);
      // 等待页面加载
      await new Promise((r) => setTimeout(r, 3000));
      const html = await getCdpPageContentAsync();
      if (html && !isVerificationChallenge(html)) {
        return html;
      }
      flog('  CDP returned challenge, falling back to full verification...');
      chromeCdpVerified = false;
    }

    const worker = getFangpiWorker();
    const { status, html } = await workerLoad(worker, url);
    const challenge = isVerificationChallenge(html);
    flog('GET', url.slice(0, 70), '→ status', status, 'challenge', challenge, 'len', html.length);
    await logClearance('  on-GET');

    if ((status === 403 || status === 503 || challenge) && !worker.isDestroyed()) {
      // 清除过期的 cf_clearance
      const existingCookies = await session.defaultSession.cookies.get({ url: 'https://www.fangpi.net' });
      if (existingCookies.find((c) => c.name === 'cf_clearance')) {
        flog('  cf_clearance exists but still 403 — removing stale cookie');
        await session.defaultSession.cookies.remove('https://www.fangpi.net', 'cf_clearance');
      }

      const verificationMode = await openExistingChromeVerification(url);

      // 通知渲染进程
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed() && w !== worker) {
          w.webContents.send('fangpi:verification-needed');
        }
      });

      // 轮询 Chrome CDP，等待验证完成
      const MAX_POLL = Math.floor(VERIFY_TIMEOUT / 5000);
      const POLL_INTERVAL = 5000;
      let pageContent = null;

      for (let i = 1; i <= MAX_POLL; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));

        flog(`  polling Chrome CDP... (${i}/${MAX_POLL})`);
        if (verificationMode === 'cdp') {
          const cdpResult = await getCdpPageContentAsync();
          if (cdpResult && !isVerificationChallenge(cdpResult)) {
            flog('  Chrome page loaded successfully! len:', cdpResult.length);
            pageContent = cdpResult;
            break;
          }
        } else {
          try {
            const retry = await workerLoad(worker, url);
            if (retry.status === 200 && !isVerificationChallenge(retry.html)) {
              flog('  Electron worker accepted after existing Chrome verification; len:', retry.html.length);
              pageContent = retry.html;
              break;
            }
          } catch (error) {
            flog('  worker retry after external Chrome verification failed:', error && error.message);
          }
        }

        if (i % 6 === 0) {
          flog(`  still waiting for Chrome verification... (${Math.round((i * POLL_INTERVAL) / 1000)}s)`);
        }
      }

      if (!pageContent) {
        flog('  Chrome verification timeout');
        throw new VerificationRequiredError(null, url);
      }

      chromeCdpVerified = verificationMode === 'cdp';

      if (verificationMode === 'cdp') {
        const cookieInfo = extractChromeCfClearance();
        if (cookieInfo) {
          try {
            await injectCfClearance(cookieInfo);
            flog('  cf_clearance injected into Electron session as backup');
          } catch { /* ignore */ }
        }
      }

      return pageContent;
    }

    return html;
  });
}

// 在空（未加载任何页面）的 worker 上 executeJavaScript 会**永久挂起**——必须先确认已停在
// fangpi 页面上才执行，并加超时兜底，否则会堵死整条串行链（搜索/下载全部卡死）。
function execJs(wc, script, ms) {
  return Promise.race([
    wc.executeJavaScript(script, true),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('页内脚本超时')), ms)),
  ]);
}

// httpPost：在 worker 页内同源 fetch（带 cf_clearance + 浏览器 TLS）。需 worker 已停在 fangpi 源上；
// 否则（如搜索前的 /api/s 预热，worker 还没导航）直接跳过——GET 会负责把 worker 导到歌曲页，
// 真正的 ad-handle/取流 POST 都发生在那之后，天然满足同源条件。
function workerPost(url, data) {
  return runOnWorker(async () => {
    const body = encodeForm(data);

    // 优先尝试 Electron worker 页内 fetch
    const worker = getFangpiWorker();
    const wc = worker.webContents;
    if (/^https?:\/\/(www\.)?fangpi\.net\//i.test(wc.getURL())) {
      const script = `(async () => {
        try {
          const res = await fetch(${JSON.stringify(url)}, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
            body: ${JSON.stringify(body)},
            credentials: 'include',
          });
          return await res.text();
        } catch (err) {
          return '__FETCH_ERROR__' + (err && err.message ? err.message : 'fetch failed');
        }
      })()`;
      const text = await execJs(wc, script, FANGPI_TIMEOUT);
      if (typeof text === 'string' && !text.startsWith('__FETCH_ERROR__')) {
        return String(text || '');
      }
    }

    // Electron worker 不可用，尝试通过 Chrome CDP 执行 fetch
    if (isChromeCDPAvailable()) {
      flog('  workerPost: using Chrome CDP for fetch');
      const cdpResult = await cdpFetchAsync(url, 'POST', body);
      if (cdpResult) return cdpResult;
    }

    return '';
  });
}

function netDownload(url, destPath) {
  return new Promise((resolve, reject) => {
    const tmp = `${destPath}.tmp`;
    // kuwo CDN 不在 Cloudflare 后面，纯二进制流，用主进程 net 直接拉即可（不需要浏览器 TLS）。
    // 不要 Referer（来自 fangpi.net 的 Referer 会被 kuwo 拒），也无需 fangpi 的 session cookie。
    const request = net.request({ method: 'GET', url, session: session.defaultSession, useSessionCookies: false, redirect: 'follow' });
    request.setHeader('User-Agent', FANGPI_UA);

    const timer = setTimeout(() => request.abort(), 60000);
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        clearTimeout(timer);
        request.abort();
        return reject(new Error(`HTTP ${response.statusCode}`));
      }

      const writeStream = fs.createWriteStream(tmp);
      response.on('data', (chunk) => writeStream.write(chunk));
      response.on('end', () => {
        writeStream.end();
      });
      response.on('error', (error) => {
        clearTimeout(timer);
        writeStream.destroy();
        reject(error);
      });
      writeStream.on('finish', () => {
        clearTimeout(timer);
        // tmp 与目标同目录同盘，renameSync 原子完成，不会触发跨设备 EXDEV。
        try {
          fs.renameSync(tmp, destPath);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      writeStream.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.end();
  });
}

// 注入给 fangpi 引擎的传输层：页面请求走真实浏览器 worker（GET 导航 / POST 页内 fetch），
// 二进制下载走 net（kuwo CDN 无 CF）。这样 cf_clearance 在浏览器 TLS 下才被 Cloudflare 接受。
const fangpiWorkerDeps = {
  httpGet: (url) => workerGet(url),
  httpPost: (url, data) => workerPost(url, data),
  downloadBinary: (url, destPath) => netDownload(url, destPath),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

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

  // 隐藏的 fangpi worker 也是一个窗口，会拖住 window-all-closed 让应用关不掉。
  // 主窗口关闭时把它一并销毁，让应用能正常退出（下次有请求会按需重建）。
  window.on('closed', () => {
    if (fangpiWorker && !fangpiWorker.isDestroyed()) {
      fangpiWorker.destroy();
    }
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
  if (process.platform === 'win32') {
    return path.join('D:\\Downloads', 'TeaMusic');
  }

  return path.join(app.getPath('music'), 'TeaMusic', 'Resolved');
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

async function downloadViaExternalBrowserPage(musicId, outputDir) {
  const startedAtMs = Date.now();
  const handoff = await resolveExternalDownloadPage(musicId, fangpiWorkerDeps);
  fs.mkdirSync(outputDir, { recursive: true });
  await shell.openExternal(handoff.url);
  return await waitForBrowserDownload({
    downloadsDir: app.getPath('downloads'),
    outDir: outputDir,
    title: handoff.title,
    artist: handoff.artist,
    startedAtMs,
    timeoutMs: 300000,
    pollMs: 1000,
  });
}

ipcMain.handle('fangpi:search', async (_event, query) => {
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery) {
    return [];
  }

  let fangpiVerification = null;
  let fangpiResults = [];
  let archiveResults = [];

  try {
    fangpiResults = await searchSongs(normalizedQuery, fangpiWorkerDeps);
  } catch (error) {
    if (error && error.code === 'VERIFY_REQUIRED' && error.verifyUrl) {
      fangpiVerification = { error: error.message, code: error.code, verifyUrl: error.verifyUrl };
    } else {
      flog('fangpi search failed:', error && error.message);
    }
  }

  try {
    archiveResults = await searchArchiveSongs(normalizedQuery);
  } catch (error) {
    flog('archive search failed:', error && error.message);
  }

  const combinedResults = [...fangpiResults, ...archiveResults];
  if (combinedResults.length > 0) {
    return combinedResults;
  }

  if (fangpiVerification) {
    return fangpiVerification;
  }

  return [];
});

ipcMain.handle('fangpi:download', async (_event, musicId) => {
  const id = String(musicId || '').trim();

  if (!id) {
    return { error: '缺少歌曲 ID' };
  }

  const outputDir = resolvedLibraryPath();
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    if (id.startsWith(ARCHIVE_ID_PREFIX)) {
      return await downloadArchiveSong(id, outputDir, {
        httpGet: (url) => workerGet(url),
        downloadBinary: (url, destPath) => netDownload(url, destPath),
      });
    }

    try {
      return await downloadSong(id, outputDir, fangpiWorkerDeps);
    } catch (directError) {
      flog('direct fangpi download failed, trying external browser handoff:', directError && directError.message);
      return await downloadViaExternalBrowserPage(id, outputDir);
    }
  } catch (error) {
    if (error && error.code === 'VERIFY_REQUIRED' && error.verifyUrl) {
      return { error: error.message, code: error.code, verifyUrl: error.verifyUrl };
    }

    return { error: error instanceof Error ? error.message : '下载失败' };
  }
});

ipcMain.handle('fangpi:verify', async (_event, rawUrl) => {
  const verificationUrl = normalizeFangpiUrl(rawUrl);

  if (!verificationUrl) {
    return false;
  }

  // 在 worker（与取数完全同一个浏览器上下文）里让人过验证。解完 cf_clearance 天然就在这个上下文。
  // 用 cf_clearance cookie 出现作为权威判据，不依赖导航事件（会误判）。
  return runOnWorker(async () => {
    const worker = getFangpiWorker();
    worker.show();
    worker.focus();
    flog('verify: showing window and loading', verificationUrl.href.slice(0, 70));

    try {
      await workerLoad(worker, verificationUrl.href);
    } catch (e) {
      flog('verify: load failed:', e.message);
    }

    // 轮询 cf_clearance cookie
    const MAX_WAIT = Math.floor(VERIFY_TIMEOUT / 5000);
    const POLL_INTERVAL = 5000;
    for (let i = 1; i <= MAX_WAIT; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      if (worker.isDestroyed()) {
        flog('verify: window closed by user');
        return true; // 用户可能验证完才关窗
      }
      try {
        const cookies = await session.defaultSession.cookies.get({ url: 'https://www.fangpi.net' });
        if (cookies.find((c) => c.name === 'cf_clearance')) {
          flog('verify: cf_clearance detected!');
          worker.hide();
          await logClearance('  after-verify');
          return true;
        }
      } catch {
        /* ignore */
      }
    }

    if (!worker.isDestroyed()) {
      worker.hide();
    }
    flog('verify: timeout');
    return false;
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

// Cloudflare Turnstile 依赖 WebRTC STUN 完成人机检测。Electron 默认配置下：
// 1. mDNS 隐藏导致 WebRTC 无法获取真实 IP → Turnstile 评分低
// 2. 内置 DNS 解析器无法解析 stun.cloudflare.com → ERR_NAME_NOT_RESOLVED -105
// 3. WebRTC 权限未授予 → STUN 请求被阻止
// 必须在 app.whenReady() 之前设置，之后改无效。
app.commandLine.appendSwitch('webrtc-ip-handling-policy', 'default_public_interface_only');
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

// 关键修复：Chromium 内部 DNS 解析器无法解析 stun.cloudflare.com（-105 错误），
// 但系统 DNS 可以。用 nslookup 解析出 IP，通过 --host-resolver-rules 注入映射，
// 绕过 Chromium 的 DNS 解析，让 Turnstile 的 STUN 请求能正常发出。
try {
  const { execSync } = require('child_process');
  const output = execSync('nslookup stun.cloudflare.com 2>nul', { encoding: 'utf8', timeout: 5000 });
  const addresses = output.match(/Address:\s*(\d+\.\d+\.\d+\.\d+)/gi);
  if (addresses && addresses.length >= 2) {
    // nslookup 输出有多行 Address:，最后一行是查询结果（前面的行是 DNS 服务器地址）
    const ip = addresses[addresses.length - 1].replace(/Address:\s*/i, '').trim();
    app.commandLine.appendSwitch('host-resolver-rules', `MAP stun.cloudflare.com ${ip}`);
    console.log('[fangpi] STUN DNS fix: stun.cloudflare.com →', ip);
  }
} catch {
  console.log('[fangpi] STUN DNS fix: nslookup failed, STUN may not work');
}

app.whenReady().then(() => {
  // 自动授予 WebRTC 相关权限，让 Turnstile 的 STUN 请求能正常发出
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediadevices') {
      return callback(true);
    }
    callback(false);
  });

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
