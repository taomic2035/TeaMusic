import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const fangpi = require('./fangpi-source.cjs') as {
  parseSongList(html: string): Array<{ id: string; title: string; artist: string }>;
  decodeAppData(html: string): Record<string, unknown> | null;
  sanitize(name: string): string;
  extractPlayUrl(jsonText: string): string;
  resolvePlayUrl(musicId: string, deps: unknown): Promise<{ title: string; artist: string; url: string }>;
  downloadSong(musicId: string, outDir: string, deps: unknown): Promise<{ filePath: string; title: string; artist: string }>;
  searchSongs(keyword: string, deps?: unknown): Promise<Array<{ id: string; title: string; artist: string }>>;
  withRequestHeaders(extraHeaders: Record<string, string>, deps: unknown): unknown;
};

describe('fangpi-source pure helpers', () => {
  it('parses and dedupes the search result list', () => {
    const html = [
      '<a href="/music/402856" class="x" title="晴天 - 周杰伦">',
      '<a href="/music/402856" title="晴天 - 周杰伦">',
      '<a href="/music/99" title="十年 - 陈奕迅">',
      '<a href="/music/100" title="无分隔符标题">',
    ].join('\n');
    expect(fangpi.parseSongList(html)).toEqual([
      { id: '402856', title: '晴天', artist: '周杰伦' },
      { id: '99', title: '十年', artist: '陈奕迅' },
    ]);
  });

  it('decodes window.appData without eval', () => {
    const html =
      'x;window.appData = JSON.parse(\'{\\"mp3_title\\":\\"\\u6674\\u5929\\",\\"mp3_author\\":\\"\\u5468\\u6770\\u4f26\\",\\"play_id\\":\\"a\\/b\\",\\"mp3_type\\":0}\');more';
    const data = fangpi.decodeAppData(html) as Record<string, unknown>;
    expect(data.mp3_title).toBe('晴天');
    expect(data.mp3_author).toBe('周杰伦');
    expect(data.play_id).toBe('a/b');
    expect(data.mp3_type).toBe(0);
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fangpi-source.cjs'), 'utf8');
    expect(src).not.toMatch(/\beval\s*\(/);
  });

  it('sanitizes filenames', () => {
    expect(fangpi.sanitize('a/b:c*?"<>|d')).toBe('a_b_c______d');
    expect(fangpi.sanitize('  多   空格  ')).toBe('多 空格');
  });

  it('extracts mp3 url from common-play-url json and throws on failure', () => {
    expect(fangpi.extractPlayUrl('{"code":1,"data":{"url":"https://x/y.mp3"}}')).toBe('https://x/y.mp3');
    expect(() => fangpi.extractPlayUrl('{"code":0,"msg":"页面已被删除"}')).toThrow('页面已被删除');
  });
  it('wraps page requests with verification cookies without changing binary downloads', async () => {
    const calls: Array<{ type: string; headers?: Record<string, string> }> = [];
    const deps = {
      httpGet: async (_url: string, headers?: Record<string, string>) => {
        calls.push({ type: 'get', headers });
        return '';
      },
      httpPost: async (_url: string, _data: unknown, headers?: Record<string, string>) => {
        calls.push({ type: 'post', headers });
        return '';
      },
      downloadBinary: async () => {
        calls.push({ type: 'download' });
      },
    };

    const wrapped = fangpi.withRequestHeaders({ Cookie: 'fp_verify=1' }, deps) as typeof deps;
    await wrapped.httpGet('https://www.fangpi.net/music/1');
    await wrapped.httpPost('https://www.fangpi.net/member/common-play-url', {});
    await wrapped.downloadBinary();

    expect(calls).toEqual([
      { type: 'get', headers: { Cookie: 'fp_verify=1' } },
      { type: 'post', headers: { Cookie: 'fp_verify=1' } },
      { type: 'download' },
    ]);
  });

  it('turns Cloudflare challenge pages into verification-required search results', async () => {
    const deps = {
      httpPost: async () => '',
      httpGet: async () => '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>',
      downloadBinary: async () => {},
    };

    await expect(fangpi.searchSongs('晴天', deps)).rejects.toMatchObject({
      code: 'VERIFY_REQUIRED',
      verifyUrl: 'https://www.fangpi.net/s/%E6%99%B4%E5%A4%A9',
    });
  });
});

describe('fangpi-source orchestration (injected http)', () => {
  it('searchSongs returns parsed list from the search page', async () => {
    const deps = {
      httpPost: async () => '',
      httpGet: async (u: string) => (u.includes('/s/') ? '<a href="/music/7" title="歌 - 手">' : ''),
      downloadBinary: async () => {},
    };
    const list = await fangpi.searchSongs('歌', deps);
    expect(list).toEqual([{ id: '7', title: '歌', artist: '手' }]);
  });

  it('resolvePlayUrl rejects paid songs', async () => {
    const page = 'window.appData = JSON.parse(\'{\\"mp3_title\\":\\"x\\",\\"mp3_author\\":\\"y\\",\\"play_id\\":\\"p\\",\\"mp3_type\\":1}\');';
    const deps = { httpGet: async () => page, httpPost: async () => '', downloadBinary: async () => {} };
    await expect(fangpi.resolvePlayUrl('1', deps)).rejects.toThrow('付费');
  });

  it('resolvePlayUrl returns a verification URL when the source asks for a human check', async () => {
    const page =
      'window.appData = JSON.parse(\'{\\"mp3_title\\":\\"x\\",\\"mp3_author\\":\\"y\\",\\"play_id\\":\\"p\\",\\"mp3_type\\":0,\\"should_verify\\":true}\');';
    const deps = { httpGet: async () => page, httpPost: async () => '', downloadBinary: async () => {} };

    await expect(fangpi.resolvePlayUrl('402856', deps)).rejects.toMatchObject({
      code: 'VERIFY_REQUIRED',
      verifyUrl: 'https://www.fangpi.net/music/402856',
    });
  });

  it('downloadSong writes file via injected downloadBinary', async () => {
    const os = require('node:os');
    const fsm = require('node:fs');
    const pathm = require('node:path');
    const outDir = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'fangpi-dl-'));
    const page = 'window.appData = JSON.parse(\'{\\"mp3_title\\":\\"晴天\\",\\"mp3_author\\":\\"周杰伦\\",\\"play_id\\":\\"p\\",\\"mp3_type\\":0}\');';
    let downloadedTo = '';
    const deps = {
      httpGet: async () => page,
      httpPost: async () => '{"code":1,"data":{"url":"https://x/y.mp3"}}',
      downloadBinary: async (_u: string, dest: string) => {
        downloadedTo = dest;
        fsm.writeFileSync(dest, 'audio');
      },
    };
    const result = await fangpi.downloadSong('1', outDir, deps);
    expect(result.title).toBe('晴天');
    expect(result.filePath).toBe(downloadedTo);
    expect(fsm.existsSync(result.filePath)).toBe(true);
    expect(result.filePath).toContain('晴天 - 周杰伦.mp3');
  });
});
