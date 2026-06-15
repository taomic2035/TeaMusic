'use strict';

const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const BASE = 'https://www.fangpi.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 50000;
const MAX_AD_WAIT_MS = 60000;

class VerificationRequiredError extends Error {
  constructor(musicId, verifyUrl = `${BASE}/music/${encodeURIComponent(String(musicId))}`) {
    super('\u9700\u8981\u771f\u4eba\u68c0\u6d4b\uff0c\u6253\u5f00\u9a8c\u8bc1\u9875\u9762\u540e\u518d\u91cd\u8bd5\u4e0b\u8f7d');
    this.name = 'VerificationRequiredError';
    this.code = 'VERIFY_REQUIRED';
    this.verifyUrl = verifyUrl;
  }
}

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
      default: return g;
    }
  });
}

function decodeAppData(html) {
  const m = String(html || '').match(/window\.appData\s*=\s*JSON\.parse\('([\s\S]+?)'\)\s*;/);
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
  throw new Error(data.msg || '\u65e0\u6cd5\u83b7\u53d6\u64ad\u653e\u5730\u5740');
}

function extractDownloadPageUrl(html) {
  const match = String(html || '').match(/href=["'](\/dp\/[^"']+)["']/i);
  if (!match) return null;
  return new URL(match[1], BASE).href;
}

function isVerificationChallenge(html) {
  return /Just a moment|Enable JavaScript and cookies|cf-browser-verification|cf-challenge-running|id="challenge-form"|_cf_chl_opt/i.test(
    String(html || ''),
  );
}

function httpGet(urlStr, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const doReq = (u) => {
      const p = new URL(u);
      const lib = p.protocol === 'http:' ? http : https;
      const req = lib.request(
        {
          hostname: p.hostname,
          path: p.pathname + p.search,
          method: 'GET',
          headers: { 'User-Agent': UA, Referer: BASE, ...extraHeaders },
          timeout: TIMEOUT,
        },
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
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('\u8bf7\u6c42\u8d85\u65f6'));
      });
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
        hostname: p.hostname,
        path: p.pathname + p.search,
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Referer: BASE,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'X-Requested-With': 'XMLHttpRequest',
          ...extraHeaders,
        },
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('\u8bf7\u6c42\u8d85\u65f6'));
    });
    req.write(body);
    req.end();
  });
}

function downloadBinary(urlStr, destPath) {
  return new Promise((resolve, reject) => {
    const tmp = destPath + '.tmp';
    const doReq = (u, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('\u91cd\u5b9a\u5411\u8fc7\u591a'));
      const p = new URL(u);
      const lib = p.protocol === 'http:' ? http : https;
      const req = lib.request(
        { hostname: p.hostname, path: p.pathname + p.search, method: 'GET', headers: { 'User-Agent': UA }, timeout: 60000 },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return doReq(new URL(res.headers.location, u).href, redirectCount + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const ws = fs.createWriteStream(tmp);
          res.pipe(ws);
          ws.on('finish', () => {
            ws.close(() => {
              try {
                fs.renameSync(tmp, destPath);
              } catch {
                fs.copyFileSync(tmp, destPath);
                fs.unlinkSync(tmp);
              }
              resolve();
            });
          });
          ws.on('error', reject);
          res.on('error', (e) => {
            ws.destroy();
            reject(e);
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('\u4e0b\u8f7d\u8d85\u65f6'));
      });
      req.end();
    };
    doReq(urlStr);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const defaultDeps = { httpGet, httpPost, downloadBinary, wait };

async function waitOutAdCountdown(musicId, adType, deps) {
  const sleep = typeof deps.wait === 'function' ? deps.wait : wait;
  try {
    const raw = await deps.httpPost(`${BASE}/api/ad-handle`, {
      mid: String(musicId),
      m_type: adType || 1,
      ignore_check_vip: 'false',
    });
    const res = JSON.parse(raw);
    const seconds = Number(res && res.code === 4 && res.data && res.data.seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      await sleep(Math.min(seconds * 1000, MAX_AD_WAIT_MS));
    }
  } catch {
    // Best effort only.
  }
}

function withRequestHeaders(extraHeaders, deps = defaultDeps) {
  const headers = extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {};

  return {
    ...deps,
    httpGet: (urlStr, requestHeaders = {}) => deps.httpGet(urlStr, { ...requestHeaders, ...headers }),
    httpPost: (urlStr, data, requestHeaders = {}) => deps.httpPost(urlStr, data, { ...requestHeaders, ...headers }),
  };
}

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

async function searchSongs(keyword, deps = defaultDeps) {
  const kw = String(keyword || '').trim();
  if (!kw) return [];
  try {
    await deps.httpPost(`${BASE}/api/s`, { keyword: kw });
  } catch {}
  const html = await deps.httpGet(`${BASE}/s/${encodeURIComponent(kw)}`);
  if (isVerificationChallenge(html)) {
    throw new VerificationRequiredError(kw, `${BASE}/s/${encodeURIComponent(kw)}`);
  }
  return parseSongList(html);
}

async function resolvePlayUrl(musicId, deps = defaultDeps) {
  const html = await deps.httpGet(`${BASE}/music/${musicId}`);
  const appData = decodeAppData(html);
  if (!appData) throw new Error('\u65e0\u6cd5\u89e3\u6790\u6b4c\u66f2\u4fe1\u606f');
  if (appData.mp3_type === 1) throw new Error('\u4ed8\u8d39\u6b4c\u66f2\uff0c\u6682\u4e0d\u652f\u6301');
  if (appData.should_verify) throw new VerificationRequiredError(musicId);
  await waitOutAdCountdown(musicId, appData.ad_type, deps);
  const json = await deps.httpPost(`${BASE}/member/common-play-url`, { id: appData.play_id });
  let url = extractPlayUrl(json);
  if (url.includes('antiserver.kuwo.cn')) url = await convertKuwoUrl(url, deps);
  return { title: appData.mp3_title, artist: appData.mp3_author, url };
}

async function resolveExternalDownloadPage(musicId, deps = defaultDeps) {
  const html = await deps.httpGet(`${BASE}/music/${musicId}`);
  const appData = decodeAppData(html);
  if (!appData) throw new Error('\u65e0\u6cd5\u89e3\u6790\u6b4c\u66f2\u4fe1\u606f');
  if (appData.mp3_type === 1) throw new Error('\u4ed8\u8d39\u6b4c\u66f2\uff0c\u6682\u4e0d\u652f\u6301');
  if (appData.should_verify) throw new VerificationRequiredError(musicId);
  const url = extractDownloadPageUrl(html);
  if (!url) throw new Error('No external download page found');
  return { title: appData.mp3_title, artist: appData.mp3_author, url };
}

async function downloadSong(musicId, outDir, deps = defaultDeps) {
  const { title, artist, url } = await resolvePlayUrl(musicId, deps);
  const artistDir = path.join(outDir, sanitize(artist));
  fs.mkdirSync(artistDir, { recursive: true });
  const filePath = path.join(artistDir, `${sanitize(title)} - ${sanitize(artist)}.mp3`);
  if (fs.existsSync(filePath)) return { filePath, title, artist };
  await deps.downloadBinary(url, filePath);
  return { filePath, title, artist };
}

module.exports = {
  parseSongList,
  decodeAppData,
  sanitize,
  extractPlayUrl,
  extractDownloadPageUrl,
  isVerificationChallenge,
  searchSongs,
  resolvePlayUrl,
  resolveExternalDownloadPage,
  downloadSong,
  withRequestHeaders,
  VerificationRequiredError,
};
