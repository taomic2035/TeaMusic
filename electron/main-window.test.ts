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
    expect(mainSource).toContain('loadURL(verificationUrl.href)');
    expect(preloadSource).toContain('openVerificationPage');
  });

  it('exposes in-process fangpi search and download, no external spawn', () => {
    expect(mainSource).toContain("ipcMain.handle('fangpi:search'");
    expect(mainSource).toContain("ipcMain.handle('fangpi:download'");
    expect(mainSource).toContain("require('./fangpi-source.cjs')");
    expect(mainSource).not.toContain('child_process');
    expect(mainSource).not.toContain('MUSICOL_DIR');
    expect(preloadSource).toContain('searchOnline');
    expect(preloadSource).toContain('downloadOnline');
    expect(preloadSource).not.toContain('resolveMissingTrack');
  });

  it('archives new online downloads under a defined TeaMusic archive path with browser cookies', () => {
    expect(mainSource).toContain("'TeaMusic', 'Archive'");
    expect(mainSource).toContain('formatCookieHeader');
    expect(mainSource).toContain('withRequestHeaders');
    expect(mainSource).toContain('session.defaultSession.cookies.get');
  });
});
