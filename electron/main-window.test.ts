import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(join(process.cwd(), 'electron/main.cjs'), 'utf8');
const preloadSource = readFileSync(join(process.cwd(), 'electron/preload.cjs'), 'utf8');

describe('Electron main window', () => {
  it('allows compact Mac windows so the narrow layout can be used', () => {
    const minWidth = Number(mainSource.match(/minWidth:\s*(\d+)/)?.[1]);

    expect(minWidth).toBeLessThanOrEqual(760);
  });

  it('removes local music from the app library without deleting audio files', () => {
    expect(mainSource).toContain("ipcMain.handle('musicol:remove-local'");
    expect(mainSource).toContain('removeFromLocalLibrary');
    expect(preloadSource).toContain('removeLocalAudioFile');
    expect(mainSource).not.toMatch(/unlinkSync|rmSync|deleteFile|trashItem/);
  });

  it('reveals local music in Finder through the shell without adding a web surface', () => {
    expect(mainSource).toContain("ipcMain.handle('musicol:reveal-local'");
    expect(mainSource).toContain('showItemInFolder');
    expect(preloadSource).toContain('revealLocalAudioFile');
    expect(mainSource).not.toContain('openExternal');
  });
});
