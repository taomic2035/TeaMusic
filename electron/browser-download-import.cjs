'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AUDIO_EXTENSIONS = /\.(mp3|m4a|ogg|flac|wav)$/i;

function sanitize(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/#[\w-]+/g, '')
    .replace(/[\s._\-()[\]【】《》<>:：]+/g, '');
}

function isPartialDownload(fileName) {
  return /\.(crdownload|part|tmp)$/i.test(fileName);
}

function matchesSong(fileName, title, artist) {
  const haystack = normalizeForMatch(path.basename(fileName, path.extname(fileName)));
  const titleNeedle = normalizeForMatch(title);
  const artistNeedle = normalizeForMatch(artist);

  return Boolean(titleNeedle && artistNeedle && haystack.includes(titleNeedle) && haystack.includes(artistNeedle));
}

function findCompletedBrowserDownload(downloadsDir, opts) {
  const title = opts && opts.title;
  const artist = opts && opts.artist;
  const startedAtMs = Number(opts && opts.startedAtMs) || 0;

  if (!downloadsDir || !fs.existsSync(downloadsDir)) {
    return null;
  }

  const candidates = fs
    .readdirSync(downloadsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(downloadsDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { fullPath, name: entry.name, stat };
    })
    .filter(({ name, stat }) => (
      AUDIO_EXTENSIONS.test(name) &&
      !isPartialDownload(name) &&
      stat.mtimeMs >= startedAtMs - 1000 &&
      matchesSong(name, title, artist)
    ))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  return candidates[0] ? candidates[0].fullPath : null;
}

function archiveBrowserDownload(srcPath, outDir, song) {
  const title = String(song && song.title ? song.title : path.basename(srcPath, path.extname(srcPath)));
  const artist = String(song && song.artist ? song.artist : 'Unknown Artist');
  const artistDir = path.join(outDir, sanitize(artist) || 'Unknown Artist');
  const extension = path.extname(srcPath) || '.mp3';
  const filePath = path.join(artistDir, `${sanitize(title) || 'Untitled'} - ${sanitize(artist) || 'Unknown Artist'}${extension}`);

  fs.mkdirSync(artistDir, { recursive: true });
  if (path.resolve(srcPath) !== path.resolve(filePath)) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
    fs.renameSync(srcPath, filePath);
  }

  return { filePath, title, artist };
}

async function waitForBrowserDownload(opts) {
  const downloadsDir = opts.downloadsDir;
  const outDir = opts.outDir;
  const title = opts.title;
  const artist = opts.artist;
  const startedAtMs = Number(opts.startedAtMs) || Date.now();
  const timeoutMs = Number(opts.timeoutMs) || 300000;
  const pollMs = Number(opts.pollMs) || 1000;
  const wait = typeof opts.wait === 'function' ? opts.wait : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = Date.now() + timeoutMs;
  let lastPath = null;
  let lastSize = -1;

  while (Date.now() < deadline) {
    const candidate = findCompletedBrowserDownload(downloadsDir, { title, artist, startedAtMs });
    if (candidate) {
      const size = fs.statSync(candidate).size;
      if (candidate === lastPath && size === lastSize && size > 0) {
        return archiveBrowserDownload(candidate, outDir, { title, artist });
      }
      lastPath = candidate;
      lastSize = size;
    }
    await wait(pollMs);
  }

  throw new Error('Timed out waiting for browser download');
}

module.exports = {
  findCompletedBrowserDownload,
  archiveBrowserDownload,
  waitForBrowserDownload,
};
