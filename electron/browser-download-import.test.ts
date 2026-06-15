import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const importer = require('./browser-download-import.cjs') as {
  findCompletedBrowserDownload(
    downloadsDir: string,
    opts: { title: string; artist: string; startedAtMs: number },
  ): string | null;
  archiveBrowserDownload(
    srcPath: string,
    outDir: string,
    song: { title: string; artist: string },
  ): { filePath: string; title: string; artist: string };
};

function touch(filePath: string, mtimeMs: number) {
  const date = new Date(mtimeMs);
  fs.utimesSync(filePath, date, date);
}

describe('browser-download-import', () => {
  it('finds the newest completed matching browser download after handoff starts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-dl-'));
    const startedAtMs = Date.now();

    const oldMatch = path.join(dir, '泸沽湖-麻园诗人-old.mp3');
    const partial = path.join(dir, '泸沽湖-麻园诗人#g9cWv.mp3.crdownload');
    const unrelated = path.join(dir, '晴天-周杰伦.mp3');
    const match = path.join(dir, '泸沽湖-麻园诗人#g9cWv(1).mp3');

    fs.writeFileSync(oldMatch, 'old');
    fs.writeFileSync(partial, 'partial');
    fs.writeFileSync(unrelated, 'other');
    fs.writeFileSync(match, 'audio');
    touch(oldMatch, startedAtMs - 20_000);
    touch(partial, startedAtMs + 1_000);
    touch(unrelated, startedAtMs + 2_000);
    touch(match, startedAtMs + 3_000);

    expect(
      importer.findCompletedBrowserDownload(dir, {
        title: '泸沽湖',
        artist: '麻园诗人',
        startedAtMs,
      }),
    ).toBe(match);
  });

  it('archives a browser download using the TeaMusic resolved naming convention', () => {
    const downloadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-dl-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolved-'));
    const src = path.join(downloadsDir, '泸沽湖-麻园诗人#g9cWv.mp3');
    fs.writeFileSync(src, 'audio');

    const result = importer.archiveBrowserDownload(src, outDir, {
      title: '泸沽湖',
      artist: '麻园诗人',
    });

    expect(result.filePath).toBe(path.join(outDir, '麻园诗人', '泸沽湖 - 麻园诗人.mp3'));
    expect(result.title).toBe('泸沽湖');
    expect(result.artist).toBe('麻园诗人');
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.existsSync(src)).toBe(false);
  });
});
