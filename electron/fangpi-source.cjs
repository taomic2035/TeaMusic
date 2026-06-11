'use strict';

const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const BASE = 'https://www.fangpi.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 50000;

class VerificationRequiredError extends Error {
  constructor(musicId) {
    super('需要真人检测，打开验证页面后再重试下载');
    this.name = 'VerificationRequiredError';
    this.code = 'VERIFY_REQUIRED';
    this.verifyUrl = `${BASE}/music/${encodeURIComponent(String(musicId))}`;
  }
}

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

// 把单引号 JS 字符串字面量主体解码为真实字符串（等价于旧版 eval 的效果，但不执行代码），
// 结果即 JSON.parse 的入参文本。
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
  if (appData.should_verify) throw new VerificationRequiredError(musicId);
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
  VerificationRequiredError,
};
