# 隐藏式在线找歌与下载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Win11 上让 TeaMusic 能精准搜索并下载真实歌曲，下载入口隐藏在独立抽屉，主界面保持简洁。

**Architecture:** 把 fangpi.net 抓取/取流/下载逻辑吸收进进程内模块 `electron/fangpi-source.cjs`（零依赖、可注入 HTTP 以便单测），经 IPC `fangpi:search`/`fangpi:download` 暴露给渲染层；渲染层在侧边栏底部低调入口打开"在线找歌"抽屉，下载结果复用现有 resolved 入库。删除旧的 spawn 外部脚本与主搜索静默下载。

**Tech Stack:** Electron(main/preload/IPC)、React 19 + TS、Vitest + Testing Library、Node 内置 https/fs/path。

参考 spec：`docs/superpowers/specs/2026-06-10-online-search-download-design.md`

---

## File Structure

| 文件 | 责任 |
|---|---|
| `electron/fangpi-source.cjs`（新） | fangpi 抓取引擎：列表解析、appData 安全解码、取流、下载 |
| `electron/fangpi-source.test.ts`（新） | 引擎单测（纯函数 + 注入 HTTP 的编排函数） |
| `electron/main.cjs` | 去 spawn/硬编码路径；加 `fangpi:search`/`fangpi:download` |
| `electron/preload.cjs` | 暴露 `searchOnline`/`downloadOnline`；删 `resolveMissingTrack` |
| `electron/main-window.test.ts` | 加断言：新 IPC 存在、旧 spawn/resolve 已移除 |
| `src/types/electron.d.ts` | 同步类型 |
| `src/domain/music.ts` | 导出并修复 `toFileAudioUrl`（三斜杠） |
| `src/domain/music.test.ts` | 加 Windows 盘符用例 |
| `electron/music-library.cjs` | 导出并修复 `toFileUrl`（三斜杠） |
| `electron/music-library.test.ts` | 修第 66 行期望；加 `toFileUrl` 单测 |
| `src/App.tsx` | 删 resolver 机制与迷你下载按钮；加隐藏入口 + 找歌抽屉 |
| `src/App.test.tsx` | 删 resolver 测试；加 finder 测试；修曲目计数 |
| `src/styles/global.css` | 隐藏入口图标 + 找歌抽屉样式 |
| `D:\vibecoding\musicol\downloader.js`（外部） | 修取流端点，独立 CLI 可用 |

---

## Task 1: fangpi-source 抓取引擎

**Files:**
- Create: `electron/fangpi-source.cjs`
- Test: `electron/fangpi-source.test.ts`

- [ ] **Step 1: 写失败测试（纯函数）**

`electron/fangpi-source.test.ts`：
```ts
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const fangpi = require('./fangpi-source.cjs') as {
  parseSongList(html: string): Array<{ id: string; title: string; artist: string }>;
  decodeAppData(html: string): Record<string, unknown> | null;
  sanitize(name: string): string;
  extractPlayUrl(jsonText: string): string;
  resolvePlayUrl(musicId: string, deps: any): Promise<{ title: string; artist: string; url: string }>;
  downloadSong(musicId: string, outDir: string, deps: any): Promise<{ filePath: string; title: string; artist: string }>;
  searchSongs(keyword: string, deps?: any): Promise<Array<{ id: string; title: string; artist: string }>>;
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
    const data = fangpi.decodeAppData(html) as any;
    expect(data.mp3_title).toBe('晴天');
    expect(data.mp3_author).toBe('周杰伦');
    expect(data.play_id).toBe('a/b');
    expect(data.mp3_type).toBe(0);
    // 确认源码不含 eval(
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fangpi-source.cjs'), 'utf8');
    expect(src).not.toMatch(/\beval\s*\(/);
  });

  it('sanitizes filenames', () => {
    expect(fangpi.sanitize('a/b:c*?"<>|d')).toBe('a_b_c_____d');
    expect(fangpi.sanitize('  多   空格  ')).toBe('多 空格');
  });

  it('extracts mp3 url from common-play-url json and throws on failure', () => {
    expect(fangpi.extractPlayUrl('{"code":1,"data":{"url":"https://x/y.mp3"}}')).toBe('https://x/y.mp3');
    expect(() => fangpi.extractPlayUrl('{"code":0,"msg":"页面已被删除"}')).toThrow('页面已被删除');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- electron/fangpi-source.test.ts`
Expected: FAIL（Cannot find module './fangpi-source.cjs'）

- [ ] **Step 3: 实现模块**

`electron/fangpi-source.cjs`（完整）：
```js
'use strict';

const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const BASE = 'https://www.fangpi.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 50000;

// ── 纯函数 ───────────────────────────────────────────────
function parseSongList(html) {
  const re = /href="\/music\/(\d+)"[^>]*title="([^"]+)"/g;
  const seen = new Set();
  const songs = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, id, rawTitle] = m;
    if (seen.has(id)) continue;
    const sep = rawTitle.indexOf(' - ');
    if (sep < 0) continue;
    seen.add(id);
    songs.push({ id, title: rawTitle.slice(0, sep).trim(), artist: rawTitle.slice(sep + 3).trim() });
  }
  return songs;
}

// 把单引号 JS 字符串字面量主体解码为真实字符串（等价于 eval 但安全），结果即 JSON 文本
function unescapeJsString(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, g) => {
    if (g[0] === 'u' || g[0] === 'x') return String.fromCharCode(parseInt(g.slice(1), 16));
    switch (g) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '0': return '\0';
      default: return g; // \\ \' \" \/ → 该字符本身
    }
  });
}

function decodeAppData(html) {
  const m = html.match(/window\.appData\s*=\s*JSON\.parse\('([\s\S]+?)'\)\s*;/);
  if (!m) return null;
  try {
    return JSON.parse(unescapeJsString(m[1]));
  } catch {
    return null;
  }
}

function sanitize(name) {
  return String(name)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function extractPlayUrl(jsonText) {
  const data = JSON.parse(jsonText);
  if (data.code === 1 && data.data && data.data.url) return data.data.url;
  throw new Error(data.msg || '无法获取播放地址');
}

// ── HTTP（默认实现，测试可注入替换）─────────────────────
function httpGet(urlStr, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const doReq = (u) => {
      const p = new URL(u);
      const lib = p.protocol === 'http:' ? http : https;
      const req = lib.request(
        { hostname: p.hostname, path: p.pathname + p.search, method: 'GET', headers: { 'User-Agent': UA, Referer: BASE, ...extraHeaders }, timeout: TIMEOUT },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return doReq(new URL(res.headers.location, u).href);
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
      req.end();
    };
    doReq(urlStr);
  });
}

function httpPost(urlStr, data, extraHeaders = {}) {
  const body = Object.entries(data).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return new Promise((resolve, reject) => {
    const p = new URL(urlStr);
    const lib = p.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        hostname: p.hostname, path: p.pathname + p.search, method: 'POST',
        headers: { 'User-Agent': UA, Referer: BASE, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), 'X-Requested-With': 'XMLHttpRequest', ...extraHeaders },
        timeout: TIMEOUT,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(body);
    req.end();
  });
}

function downloadBinary(urlStr, destPath) {
  return new Promise((resolve, reject) => {
    const tmp = destPath + '.tmp';
    const doReq = (u, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('重定向过多'));
      const p = new URL(u);
      const lib = p.protocol === 'http:' ? http : https;
      const req = lib.request(
        { hostname: p.hostname, path: p.pathname + p.search, method: 'GET', headers: { 'User-Agent': UA }, timeout: 60000 },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return doReq(new URL(res.headers.location, u).href, redirectCount + 1);
          }
          if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
          const ws = fs.createWriteStream(tmp);
          res.pipe(ws);
          ws.on('finish', () => {
            ws.close(() => {
              try { fs.renameSync(tmp, destPath); }
              catch { fs.copyFileSync(tmp, destPath); fs.unlinkSync(tmp); }
              resolve();
            });
          });
          ws.on('error', reject);
          res.on('error', (e) => { ws.destroy(); reject(e); });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')); });
      req.end();
    };
    doReq(urlStr);
  });
}

const defaultDeps = { httpGet, httpPost, downloadBinary };

// ── kuwo antiserver 链接转换 ─────────────────────────────
async function convertKuwoUrl(origUrl, deps) {
  try {
    const u = new URL(origUrl);
    u.searchParams.set('type', 'convert_url3');
    u.searchParams.set('callback', '?');
    const res = await deps.httpGet(u.href);
    const jm = res.match(/\?\(([\s\S]+?)\)/);
    if (jm) {
      const data = JSON.parse(jm[1]);
      if (data.code === 200 && data.url) return data.url;
    }
  } catch {}
  return origUrl;
}

// ── 编排函数 ─────────────────────────────────────────────
async function searchSongs(keyword, deps = defaultDeps) {
  const kw = String(keyword || '').trim();
  if (!kw) return [];
  try { await deps.httpPost(`${BASE}/api/s`, { keyword: kw }); } catch {}
  const html = await deps.httpGet(`${BASE}/s/${encodeURIComponent(kw)}`);
  return parseSongList(html);
}

async function resolvePlayUrl(musicId, deps = defaultDeps) {
  const html = await deps.httpGet(`${BASE}/music/${musicId}`);
  const appData = decodeAppData(html);
  if (!appData) throw new Error('无法解析歌曲信息');
  if (appData.mp3_type === 1) throw new Error('付费歌曲，暂不支持');
  if (appData.should_verify) throw new Error('需要人机验证，暂时无法下载');
  const json = await deps.httpPost(`${BASE}/member/common-play-url`, { id: appData.play_id });
  let url = extractPlayUrl(json);
  if (url.includes('antiserver.kuwo.cn')) url = await convertKuwoUrl(url, deps);
  return { title: appData.mp3_title, artist: appData.mp3_author, url };
}

async function downloadSong(musicId, outDir, deps = defaultDeps) {
  const { title, artist, url } = await resolvePlayUrl(musicId, deps);
  const artistDir = path.join(outDir, sanitize(artist));
  fs.mkdirSync(artistDir, { recursive: true });
  const filePath = path.join(artistDir, `${sanitize(title)}-${sanitize(artist)}.mp3`);
  if (fs.existsSync(filePath)) return { filePath, title, artist };
  await deps.downloadBinary(url, filePath);
  return { filePath, title, artist };
}

module.exports = {
  parseSongList,
  decodeAppData,
  sanitize,
  extractPlayUrl,
  searchSongs,
  resolvePlayUrl,
  downloadSong,
};
```

- [ ] **Step 4: 跑纯函数测试确认通过**

Run: `npm test -- electron/fangpi-source.test.ts`
Expected: PASS（4 个纯函数用例）

- [ ] **Step 5: 加注入 HTTP 的编排测试**

在 `fangpi-source.test.ts` 末尾追加：
```ts
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
      downloadBinary: async (_u: string, dest: string) => { downloadedTo = dest; fsm.writeFileSync(dest, 'audio'); },
    };
    const result = await fangpi.downloadSong('1', outDir, deps);
    expect(result.title).toBe('晴天');
    expect(result.filePath).toBe(downloadedTo);
    expect(fsm.existsSync(result.filePath)).toBe(true);
    expect(result.filePath).toContain('晴天-周杰伦.mp3');
  });
});
```

- [ ] **Step 6: 跑全部引擎测试**

Run: `npm test -- electron/fangpi-source.test.ts`
Expected: PASS（7 用例）

- [ ] **Step 7: 真实冒烟（手动，不进 CI）**

Run: `node -e "require('./electron/fangpi-source.cjs').searchSongs('周杰伦').then(r=>console.log(r.slice(0,3)))"`
Expected: 打印若干 `{id,title,artist}`（验证线上仍可用）。失败则记录、不阻塞单测。

- [ ] **Step 8: Commit**

```bash
git add electron/fangpi-source.cjs electron/fangpi-source.test.ts
git commit -m "feat: fangpi 进程内抓取/下载引擎"
```

---

## Task 2: Win11 文件 URL 修复

**Files:**
- Modify: `src/domain/music.ts`（`toFileAudioUrl` 导出 + 三斜杠）
- Test: `src/domain/music.test.ts`
- Modify: `electron/music-library.cjs`（`toFileUrl` 导出 + 三斜杠）
- Test: `electron/music-library.test.ts`

- [ ] **Step 1: 写失败测试（domain）**

`src/domain/music.test.ts` 顶部 import 增加 `toFileAudioUrl`，并加用例：
```ts
it('builds three-slash file urls for windows and posix paths', () => {
  expect(toFileAudioUrl('D:/Music/TeaMusic/Resolved/周杰伦/晴天-周杰伦.mp3')).toBe(
    'file:///D:/Music/TeaMusic/Resolved/%E5%91%A8%E6%9D%B0%E4%BC%A6/%E6%99%B4%E5%A4%A9-%E5%91%A8%E6%9D%B0%E4%BC%A6.mp3',
  );
  expect(toFileAudioUrl('D:\\Music\\x-y.mp3')).toBe('file:///D:/Music/x-y.mp3');
  expect(toFileAudioUrl('/Users/taomic/Music/x-y.mp3')).toBe('file:///Users/taomic/Music/x-y.mp3');
});
```

- [ ] **Step 2: 跑确认失败**

Run: `npm test -- src/domain/music.test.ts`
Expected: FAIL（`toFileAudioUrl` 未导出 / Windows 路径输出两斜杠）

- [ ] **Step 3: 修实现（music.ts）**

`src/domain/music.ts` 把：
```ts
function toFileAudioUrl(filePath: string): string {
  return encodeURI(`file://${filePath.replace(/\\/g, '/')}`);
}
```
改为：
```ts
export function toFileAudioUrl(filePath: string): string {
  const forward = filePath.replace(/\\/g, '/');
  const url = forward.startsWith('/') ? `file://${forward}` : `file:///${forward}`;
  return encodeURI(url);
}
```

- [ ] **Step 4: 跑确认通过**

Run: `npm test -- src/domain/music.test.ts`
Expected: PASS（新用例 + 原 `%20` 用例仍绿）

- [ ] **Step 5: 修 music-library.cjs 并加测试**

`electron/music-library.cjs`：把 `toFileUrl` 改为三斜杠并加入 `module.exports`：
```js
function toFileUrl(filePath) {
  const forward = filePath.replace(/\\/g, '/');
  const url = forward.startsWith('/') ? `file://${forward}` : `file:///${forward}`;
  return encodeURI(url);
}
```
`module.exports` 增加 `toFileUrl`。

`electron/music-library.test.ts`：
- 顶部加 helper 并修第 66 行期望（原 `encodeURI(\`file://${cover}\`)`）：
```ts
const fileUrl = (p: string) => {
  const f = p.replace(/\\/g, '/');
  return encodeURI(f.startsWith('/') ? `file://${f}` : `file:///${f}`);
};
// 第 66 行改为：
expect(readSidecarArtwork(track)).toBe(fileUrl(cover));
```
- 新增直接单测：
```ts
it('builds three-slash file urls cross-platform', () => {
  const { toFileUrl } = require('./music-library.cjs') as { toFileUrl(p: string): string };
  expect(toFileUrl('D:\\Music\\x.jpg')).toBe('file:///D:/Music/x.jpg');
  expect(toFileUrl('/Users/x/a.jpg')).toBe('file:///Users/x/a.jpg');
});
```

- [ ] **Step 6: 跑确认通过**

Run: `npm test -- electron/music-library.test.ts src/domain/music.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain/music.ts src/domain/music.test.ts electron/music-library.cjs electron/music-library.test.ts
git commit -m "fix: Win11 file:// 三斜杠，本地/下载歌曲可播放"
```

---

## Task 3: main/preload/IPC 重接线

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/types/electron.d.ts`
- Test: `electron/main-window.test.ts`

- [ ] **Step 1: 写失败测试（main-window）**

`electron/main-window.test.ts` 追加：
```ts
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
```

- [ ] **Step 2: 跑确认失败**

Run: `npm test -- electron/main-window.test.ts`
Expected: FAIL

- [ ] **Step 3: 改 main.cjs**

- 删除：`const { spawn } = require('node:child_process');`、`MUSICOL_DIR`、`DOWNLOADER_PATH` 常量、整个 `ipcMain.handle('musicol:resolve', ...)`。
- 顶部 require 增加：`const { searchSongs, downloadSong } = require('./fangpi-source.cjs');`
- `musicol:scan-resolved` 保留不变（已只扫 Resolved 目录）。
- 新增两个 handler：
```js
ipcMain.handle('fangpi:search', async (_event, query) => {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];
  try {
    return await searchSongs(normalizedQuery);
  } catch {
    return [];
  }
});

ipcMain.handle('fangpi:download', async (_event, musicId) => {
  const id = String(musicId || '').trim();
  if (!id) return { error: '缺少歌曲 ID' };
  const outputDir = path.join(app.getPath('music'), 'TeaMusic', 'Resolved');
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    return await downloadSong(id, outputDir);
  } catch (error) {
    return { error: error instanceof Error ? error.message : '下载失败' };
  }
});
```

- [ ] **Step 4: 改 preload.cjs**

删 `resolveMissingTrack` 行，加：
```js
  searchOnline: (query) => ipcRenderer.invoke('fangpi:search', query),
  downloadOnline: (musicId) => ipcRenderer.invoke('fangpi:download', musicId),
```

- [ ] **Step 5: 改 electron.d.ts**

`teaMusicBackend` 接口：删 `resolveMissingTrack`，加：
```ts
    searchOnline(query: string): Promise<Array<{ id: string; title: string; artist: string }>>;
    downloadOnline(
      musicId: string,
    ): Promise<{ filePath: string; title: string; artist: string } | { error: string }>;
```

- [ ] **Step 6: 跑确认通过**

Run: `npm test -- electron/main-window.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add electron/main.cjs electron/preload.cjs src/types/electron.d.ts electron/main-window.test.ts
git commit -m "feat: IPC 接入进程内 fangpi 搜索/下载，移除 spawn"
```

---

## Task 4: App.tsx — 移除 resolver、加隐藏入口与找歌抽屉

> 注意：`createResolverJob`/`getResolverSummary` 仍由 `music.test.ts` 覆盖，**保留在 domain，不删**；仅从 App.tsx 移除其使用与 import。`mergeTracksById` 保留（本地导入与下载复用）。

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 移除 resolver 机制**

- import（`./domain/music`）删除 `createResolverJob`、`getResolverSummary`。
- 删除 `const autoResolveDelayMs = 250;`（约 208 行）。
- 删除状态：`resolverJobs`、`resolverQueryRef`、`resolverSummary`、`activeResolverJob`、`activeResolverBadge`。
- 删除 `queueResolverJob` 函数（约 862–907）与其后 `useEffect` 自动补全块（约 909–925）。
- 删除 `downloadTrack` 函数（约 1096–1125）。
- 搜索框 `onKeyDown` 删掉 `Enter` 分支里 `void queueResolverJob();`（只保留 `Escape` 清空）。
- 删除 `resolver-status` 那行 `<span>`（约 1461）。
- 删除 `activeResolverBadge`/`resolver-row` 渲染块（约 1540–1548）。
- 空状态里 `{emptyState.canResolve ? <button onClick={queueResolverJob}>尝试曲库补全</button> : null}` 改为 `null`（或删除该行）。
- 删除播放条迷你下载按钮块（约 1656–1672 `currentTrack.source === 'catalog'` 三元），该位置渲染 `null`。
- 若 `Download` 图标在别处不再使用，从 lucide import 移除。

- [ ] **Step 2: 加 finder 状态与图标 import**

- lucide import 增加 `CloudDownload`（隐藏入口图标）。
- 组件内加状态：
```tsx
const [isFinderOpen, setIsFinderOpen] = useState(false);
const [finderQuery, setFinderQuery] = useState('');
const [finderResults, setFinderResults] = useState<Array<{ id: string; title: string; artist: string }>>([]);
const [finderLoading, setFinderLoading] = useState(false);
const [finderError, setFinderError] = useState('');
```
（`downloadingIds` 状态保留复用。）

- [ ] **Step 3: 加 finder 行为函数**

```tsx
async function runOnlineSearch() {
  const q = finderQuery.trim();
  if (!q || !window.teaMusicBackend?.searchOnline) return;
  setFinderLoading(true);
  setFinderError('');
  try {
    const results = await window.teaMusicBackend.searchOnline(q);
    setFinderResults(results);
    if (results.length === 0) setFinderError('没找到，换个关键词试试');
  } catch {
    setFinderError('搜索失败，稍后再试');
  } finally {
    setFinderLoading(false);
  }
}

async function downloadFromFinder(song: { id: string; title: string; artist: string }) {
  if (!window.teaMusicBackend?.downloadOnline || downloadingIds.has(song.id)) return;
  setDownloadingIds((ids) => new Set(ids).add(song.id));
  try {
    const result = await window.teaMusicBackend.downloadOnline(song.id);
    if (result && 'filePath' in result) {
      const track = createResolvedTrackFromPath(result.filePath, new Date().toISOString());
      setTracks((existing) => mergeTracksById([track], existing));
      setFinderResults((rows) => rows.filter((row) => row.id !== song.id));
    } else {
      setFinderError(result?.error || '这首暂时下不了，换一首');
    }
  } catch {
    setFinderError('下载失败，换一首试试');
  } finally {
    setDownloadingIds((ids) => {
      const next = new Set(ids);
      next.delete(song.id);
      return next;
    });
  }
}
```

- [ ] **Step 4: 加侧边栏隐藏入口**

在 `aside.sidebar` 的 `</section>` 与 `</aside>` 之间（playlist-section 之后）加：
```tsx
<button className="finder-entry" onClick={() => setIsFinderOpen(true)} aria-label="在线找歌">
  <CloudDownload size={15} strokeWidth={2.2} />
</button>
```

- [ ] **Step 5: 加找歌抽屉**

在主 return 顶层（与 `queue-drawer` 同级，靠近其渲染处）加条件渲染：
```tsx
{isFinderOpen ? (
  <div className="finder-overlay" role="dialog" aria-label="在线找歌">
    <div className="finder-panel glass-panel">
      <div className="finder-head">
        <span>在线找歌</span>
        <button aria-label="关闭" onClick={() => setIsFinderOpen(false)}><X size={16} /></button>
      </div>
      <label className="finder-search">
        <Search size={15} />
        <input
          autoFocus
          placeholder="歌名或歌手，回车搜索"
          value={finderQuery}
          onChange={(e) => setFinderQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runOnlineSearch();
            if (e.key === 'Escape') setIsFinderOpen(false);
          }}
        />
      </label>
      {finderError ? <p className="finder-hint">{finderError}</p> : null}
      <ul className="finder-list">
        {finderResults.map((song) => (
          <li key={song.id}>
            <div className="finder-meta">
              <span className="finder-title">{song.title}</span>
              <span className="finder-artist">{song.artist}</span>
            </div>
            {downloadingIds.has(song.id) ? (
              <span className="finder-dl downloading"><Download size={16} /></span>
            ) : (
              <button className="finder-dl" aria-label="下载" onClick={() => void downloadFromFinder(song)}>
                <Download size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {finderLoading ? <p className="finder-hint">搜索中…</p> : null}
    </div>
  </div>
) : null}
```
（保留 `Download` 图标 import，供抽屉使用。）

- [ ] **Step 6: 类型检查**

Run: `npm run typecheck`
Expected: 无错误（如有未用 import 顺手清理）

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: 隐藏式在线找歌抽屉，移除主搜索静默下载与迷你下载按钮"
```

---

## Task 5: App.test.tsx — 重写 resolver 相关测试

**Files:**
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 删除/改写耦合 resolver 的测试**

删除以下 resolver/补全/迷你下载相关用例（按描述定位）：
- "downloads the current online track on demand and marks it downloaded"
- "imports a resolved backend result back into the library quietly"
- "does not duplicate resolved backend paths already in the library"
- 回车补全、防抖（"…debounce…"/"重复补全"）、"自动补全"、"shows a subtle resolving row…"、最短长度（"周"）、失败（"1 首失败"）、重试（"重试补全"）、空状态"尝试曲库补全"相关断言。

把各 mock 里的 `resolveMissingTrack: ...` 行整体删除（新 backend 无此方法）。涉及 `restores previously resolved tracks`/启动恢复类用例：删掉其 `resolveMissingTrack` mock 行即可（其余对 `scanResolvedLibrary` 的断言保留）。

- [ ] **Step 2: 加 backend mock helper（含新方法）**

在文件现有 mock 工具处统一补 `searchOnline`/`downloadOnline` 默认实现（搜索返回空、下载返回 error），确保不再引用 `resolveMissingTrack`。

- [ ] **Step 3: 加 finder 新测试**

```tsx
it('opens the hidden finder and downloads an online track into the library', async () => {
  const downloadOnline = vi.fn(async () => ({
    filePath: 'D:/Music/TeaMusic/Resolved/周杰伦/晴天-周杰伦.mp3',
    title: '晴天',
    artist: '周杰伦',
  }));
  window.teaMusicBackend = {
    scanResolvedLibrary: async () => [],
    scanLocalLibrary: async () => [],
    chooseLocalAudioFiles: async () => [],
    searchOnline: async () => [{ id: '402856', title: '晴天', artist: '周杰伦' }],
    downloadOnline,
  } as unknown as typeof window.teaMusicBackend;

  render(<App />);
  fireEvent.click(screen.getByLabelText('在线找歌'));
  fireEvent.change(screen.getByPlaceholderText('歌名或歌手，回车搜索'), { target: { value: '晴天' } });
  fireEvent.keyDown(screen.getByPlaceholderText('歌名或歌手，回车搜索'), { key: 'Enter' });

  await waitFor(() => expect(screen.getByText('晴天')).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('下载'));
  await waitFor(() => expect(downloadOnline).toHaveBeenCalledWith('402856'));
  await waitFor(() => expect(screen.getAllByText('晴天').length).toBeGreaterThan(0));
});

it('main search never triggers any download', async () => {
  const downloadOnline = vi.fn();
  const searchOnline = vi.fn(async () => []);
  window.teaMusicBackend = {
    scanResolvedLibrary: async () => [],
    scanLocalLibrary: async () => [],
    chooseLocalAudioFiles: async () => [],
    searchOnline,
    downloadOnline,
  } as unknown as typeof window.teaMusicBackend;

  render(<App />);
  const search = screen.getByPlaceholderText('搜索歌曲、歌手、歌单');
  fireEvent.change(search, { target: { value: '不存在的歌' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  await new Promise((r) => window.setTimeout(r, 300));
  expect(downloadOnline).not.toHaveBeenCalled();
  expect(searchOnline).not.toHaveBeenCalled();
});
```
（确保导入 `waitFor`；按需调整 mock 字段以满足 TS。）

- [ ] **Step 4: 跑全量并修计数断言**

Run: `npm test -- src/App.test.tsx`
Expected: PASS。若 "4 首 …" 等计数因移除测试数据而变化，按实际渲染更新断言文本。

- [ ] **Step 5: Commit**

```bash
git add src/App.test.tsx
git commit -m "test: 重写为 finder 下载，移除 resolver 静默下载用例"
```

---

## Task 6: 样式

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: 加隐藏入口与抽屉样式**

复用现有玻璃材质变量/类。新增（克制、低调）：
```css
.finder-entry {
  margin-top: auto;
  align-self: flex-start;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.32);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease;
}
.finder-entry:hover {
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.06);
}
.finder-overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 12, 0.5);
  display: grid;
  place-items: center;
  z-index: 60;
}
.finder-panel {
  width: min(460px, 92vw);
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
}
.finder-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}
.finder-head button { background: none; border: none; color: inherit; cursor: pointer; }
.finder-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
}
.finder-search input { flex: 1; background: none; border: none; color: inherit; outline: none; }
.finder-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: flex; flex-direction: column; }
.finder-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.finder-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.finder-title { font-weight: 500; }
.finder-artist { font-size: 12px; color: rgba(255, 255, 255, 0.5); }
.finder-dl {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
}
.finder-dl:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
.finder-dl.downloading { color: rgba(255, 255, 255, 0.4); animation: pulse 1.2s ease-in-out infinite; }
.finder-hint { font-size: 12px; color: rgba(255, 255, 255, 0.5); margin: 0; }
```
（若已有 `@keyframes pulse` 则复用，否则补一个简单的透明度脉冲。）

- [ ] **Step 2: 跑测试 + 类型检查**

Run: `npm run typecheck && npm test`
Expected: 全绿。

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style: 在线找歌入口与抽屉样式"
```

---

## Task 7: 修外部 downloader.js 端点（独立 CLI 可用）

**Files:**
- Modify: `D:\vibecoding\musicol\downloader.js`

- [ ] **Step 1: 改取流端点**

`downloadSong` 内：把
```js
playRes = JSON.parse(await httpPost(`${BASE}/api/play-url`, { id: play_id }));
```
改为
```js
playRes = JSON.parse(await httpPost(`${BASE}/member/common-play-url`, { id: play_id }));
```
并把成功判断 `playRes.code !== 1 || !playRes.data?.url` 保持不变（新接口同结构）。

- [ ] **Step 2: 真实冒烟**

Run: `node "D:/vibecoding/musicol/downloader.js" --keyword 周杰伦 --limit 1 --out "D:/vibecoding/musicol/_smoke"`
Expected: 下载成功 1 首；随后 `Remove-Item -Recurse -Force D:/vibecoding/musicol/_smoke`。

- [ ] **Step 3: 该文件在独立仓库，按其约定单独提交（不在 TeaMusic git 内）。**

---

## Task 8: 收尾验证

- [ ] **Step 1: 全量质量门禁**

Run: `npm run build`（= typecheck + vite build）与 `npm test`
Expected: 全部通过。

- [ ] **Step 2: 真机冒烟（手动）**

Run: `npm run start:mac`（Win 下即 `npm run build && electron .`，脚本名沿用）。打开侧边栏底部入口 → 搜索 → 下载 → 歌曲入库并可播放。记录结果。

- [ ] **Step 3: 更新 README 功能描述**（如时间允许）：把"经 musicol 后端"改为"内置在线找歌（独立面板）"。

---

## Self-Review

- **Spec 覆盖**：进程内引擎(Task1)、Win11 URL(Task2)、IPC 重接(Task3)、隐藏抽屉+移除静默下载/迷你按钮(Task4)、测试重写(Task5)、样式(Task6)、外部 CLI 修复(Task7)、收尾(Task8)——spec 各项均有对应任务。
- **占位符**：无 TBD/TODO；关键代码均给出完整实现。
- **类型一致**：`searchOnline`/`downloadOnline` 在 preload、d.ts、App.tsx、测试中签名一致；`downloadSong` 返回 `{filePath,title,artist}` 贯穿 main/引擎/App；`toFileAudioUrl`/`toFileUrl` 修复式一致。
- **保留项**：`createResolverJob`/`getResolverSummary`/`mergeTracksById` 保留，避免破坏 domain 测试与本地导入。
- **风险**：fangpi 线上可用性（Task1 Step7、Task7 Step2 冒烟把关）；Turnstile 触发时如实报错不绕。
