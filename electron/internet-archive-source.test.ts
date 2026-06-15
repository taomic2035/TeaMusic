import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const archive = require('./internet-archive-source.cjs') as {
  archiveSearchUrl(query: string): string;
  parseSearchResponse(jsonText: string): Array<{ id: string; title: string; artist: string; source: string }>;
  searchArchiveSongs(query: string, deps: { httpGet(url: string): Promise<string> }): Promise<Array<{ id: string; title: string; artist: string; source: string }>>;
  downloadArchiveSong(
    id: string,
    outDir: string,
    deps: { httpGet(url: string): Promise<string>; downloadBinary(url: string, destPath: string): Promise<void> },
  ): Promise<{ filePath: string; title: string; artist: string; source: string }>;
  decodeArchiveId(id: string): string | null;
  chooseAudioFile(files: Array<{ name: string; format?: string }>): { name: string; format?: string } | null;
};

describe('internet-archive-source', () => {
  it('builds an audio-only advanced search URL', () => {
    const url = archive.archiveSearchUrl('ambient piano');
    const query = new URL(url).searchParams.get('q') ?? '';

    expect(url).toContain('advancedsearch.php');
    expect(query).toContain('mediatype:audio');
    expect(query).toContain('title:"ambient piano"');
    expect(url).toContain('output=json');
  });

  it('maps search docs to TeaMusic online result rows', async () => {
    const rows = await archive.searchArchiveSongs('lofi', {
      httpGet: async () =>
        JSON.stringify({
          response: {
            docs: [
              { identifier: 'free-track-1', title: 'Free Track', creator: ['Open Artist'] },
              { identifier: 'free-track-2', title: 'Another Track', creator: 'Archive Artist' },
            ],
          },
        }),
    });

    expect(rows).toEqual([
      { id: 'archive:free-track-1', title: 'Free Track', artist: 'Open Artist', source: 'Internet Archive' },
      { id: 'archive:free-track-2', title: 'Another Track', artist: 'Archive Artist', source: 'Internet Archive' },
    ]);
  });

  it('downloads the preferred audio file into the archive naming convention', async () => {
    const os = require('node:os');
    const fs = require('node:fs');
    const path = require('node:path');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-dl-'));
    let downloadedUrl = '';
    let downloadedTo = '';

    const result = await archive.downloadArchiveSong('archive:free-track-1', outDir, {
      httpGet: async () =>
        JSON.stringify({
          metadata: { title: 'Free Track', creator: 'Open Artist' },
          files: [
            { name: 'cover.jpg', format: 'JPEG' },
            { name: 'free-track.ogg', format: 'Ogg Vorbis' },
            { name: 'free-track.mp3', format: 'VBR MP3' },
          ],
        }),
      downloadBinary: async (url: string, destPath: string) => {
        downloadedUrl = url;
        downloadedTo = destPath;
        fs.writeFileSync(destPath, 'audio');
      },
    });

    expect(downloadedUrl).toBe('https://archive.org/download/free-track-1/free-track.mp3');
    expect(result.filePath).toBe(downloadedTo);
    expect(result.filePath).toContain(path.join('Open Artist', 'Free Track - Open Artist.mp3'));
    expect(result.source).toBe('Internet Archive');
  });
});
