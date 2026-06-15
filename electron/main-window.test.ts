import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(join(process.cwd(), 'electron/main.cjs'), 'utf8');
const preloadSource = readFileSync(join(process.cwd(), 'electron/preload.cjs'), 'utf8');

describe('Electron main window', () => {
  it('allows compact Mac windows so the narrow layout can be used', () => {
    const minWidth = Number(mainSource.match(/minWidth:\s*(\d+)/)?.[1]);

    expect(minWidth).toBeLessThanOrEqual(760);
  });

  it('uses the TeaMusic brand icon for the desktop window', () => {
    expect(mainSource).toContain('teamusic-icon.png');
    expect(existsSync(join(process.cwd(), 'assets', 'brand', 'teamusic-icon.png'))).toBe(true);
  });

  it('removes local music from the app library without deleting audio files', () => {
    expect(mainSource).toContain("ipcMain.handle('musicol:remove-local'");
    expect(mainSource).toContain('removeFromLocalLibrary');
    expect(preloadSource).toContain('removeLocalAudioFile');
    expect(mainSource).not.toMatch(/unlinkSync|rmSync|deleteFile|trashItem/);
  });

  it('reveals local music in Finder through the shell and opens verification inside the app', () => {
    expect(mainSource).toContain("ipcMain.handle('musicol:reveal-local'");
    expect(mainSource).toContain('showItemInFolder');
    expect(preloadSource).toContain('revealLocalAudioFile');
    expect(mainSource).toContain("ipcMain.handle('fangpi:verify'");
    expect(mainSource).toContain('BrowserWindow');
    expect(mainSource).toContain('workerLoad(worker, verificationUrl.href)');
    expect(preloadSource).toContain('openVerificationPage');
  });

  it('exposes in-process fangpi search and download, no external spawn for music', () => {
    expect(mainSource).toContain("ipcMain.handle('fangpi:search'");
    expect(mainSource).toContain("ipcMain.handle('fangpi:download'");
    expect(mainSource).toContain("require('./fangpi-source.cjs')");
    expect(mainSource).not.toContain('MUSICOL_DIR');
    expect(preloadSource).toContain('searchOnline');
    expect(preloadSource).toContain('downloadOnline');
    expect(preloadSource).not.toContain('resolveMissingTrack');
  });

  it('archives new online downloads under a defined TeaMusic archive path', () => {
    expect(mainSource).toContain("'TeaMusic', 'Archive'");
    // 二进制下载走主进程 net（kuwo CDN 无 Cloudflare）。
    expect(mainSource).toContain('net.request');
  });

  it('routes fangpi page requests through a real BrowserWindow worker, not main-process net', () => {
    // 根因修复：net 的 TLS 指纹与浏览器不同，Cloudflare 每请求校验 TLS，cf_clearance 在 net 上必被重挑战。
    // 页面 GET/POST 必须从真实渲染器（worker BrowserWindow）发起，才带浏览器 TLS + cf_clearance。
    expect(mainSource).toContain('getFangpiWorker');
    expect(mainSource).toContain('workerGet');
    expect(mainSource).toContain('workerPost');
    expect(mainSource).toContain('fangpiWorkerDeps');
    // 页面取数不得再走 net.request（只有二进制下载可以）。
    expect(mainSource).not.toContain('netText');
  });

  it('never runs in-page JS on an unloaded worker (would hang forever and block the whole queue)', () => {
    // 回归护栏：空 worker 上 executeJavaScript 会永久挂起 → 堵死串行链 → 搜索卡死且不弹验证窗。
    // workerPost 必须先确认 worker 已停在 fangpi 页面（getURL），并对页内脚本加超时兜底。
    expect(mainSource).toContain('wc.getURL()');
    expect(mainSource).toMatch(/execJs\(/);
    expect(mainSource).toMatch(/Promise\.race/);
  });

  it('keeps the verification UA identical to the request UA so cf_clearance stays valid', () => {
    // 回归护栏：验证窗口与取数请求必须用同一个 UA 常量，否则 Cloudflare 会作废 clearance。
    expect(mainSource).toContain('setUserAgent(FANGPI_UA)');
    expect(mainSource).toContain("setHeader('User-Agent', FANGPI_UA)");
    expect(mainSource).not.toMatch(/Electron\//);
  });

  it('runs verification inside the same worker and detects clearance by cf_clearance cookie', () => {
    // 解题与取数同一个浏览器上下文：worker.show() 让人点一下 Turnstile，hide 续跑。
    expect(mainSource).toContain('worker.show()');
    expect(mainSource).toContain('worker.hide()');
    // 用 cf_clearance cookie 出现作为权威判据，而非导航事件（pushState 会误判）或 DOM 文案。
    expect(mainSource).toMatch(/cf_clearance/);
    expect(mainSource).toMatch(/cookies\.find/);
  });

  it('surfaces a verification requirement when a page GET hits the Cloudflare challenge', () => {
    // worker 导航：403/503 或拦截页文案 → 抛 VerificationRequiredError，让上层弹出验证窗口。
    expect(mainSource).toContain('VerificationRequiredError');
    expect(mainSource).toMatch(/status === 403 \|\| status === 503/);
    expect(mainSource).toContain('isVerificationChallenge');
  });

  it('uses the existing Chrome session for verification instead of launching a separate Chrome profile', () => {
    expect(mainSource).toContain('openExistingChromeVerification');
    expect(mainSource).toContain('shell.openExternal');
    expect(mainSource).not.toContain('launchChromeWithCDP');
    expect(mainSource).not.toContain('--user-data-dir');
    expect(mainSource).not.toContain('--remote-debugging-port');
    expect(mainSource).not.toContain('spawn(chromeExe');
  });

  it('includes Internet Archive as a legal fallback source for downloadable audio', () => {
    expect(mainSource).toContain("require('./internet-archive-source.cjs')");
    expect(mainSource).toContain('searchArchiveSongs');
    expect(mainSource).toContain('downloadArchiveSong');
    expect(mainSource).toContain('ARCHIVE_ID_PREFIX');
  });
});
