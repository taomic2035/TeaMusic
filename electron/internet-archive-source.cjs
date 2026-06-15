'use strict';

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const ARCHIVE_BASE = 'https://archive.org';
const ARCHIVE_ID_PREFIX = 'archive:';
const AUDIO_EXTENSIONS = /\.(mp3|m4a|ogg|flac|wav)$/i;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'TeaMusic/0.1' }, timeout: 50000 }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

function sanitize(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function encodeArchiveId(identifier) {
  return `${ARCHIVE_ID_PREFIX}${encodeURIComponent(String(identifier))}`;
}

function decodeArchiveId(id) {
  const value = String(id || '');
  if (!value.startsWith(ARCHIVE_ID_PREFIX)) {
    return null;
  }

  return decodeURIComponent(value.slice(ARCHIVE_ID_PREFIX.length));
}

function archiveSearchUrl(query, rows = 8) {
  const url = new URL(`${ARCHIVE_BASE}/advancedsearch.php`);
  const escaped = String(query || '').trim().replace(/"/g, '\\"');
  url.searchParams.set('q', `mediatype:audio AND (${escaped ? `title:"${escaped}" OR creator:"${escaped}" OR description:"${escaped}"` : 'collection:opensource_audio'})`);
  url.searchParams.append('fl[]', 'identifier');
  url.searchParams.append('fl[]', 'title');
  url.searchParams.append('fl[]', 'creator');
  url.searchParams.set('rows', String(rows));
  url.searchParams.set('page', '1');
  url.searchParams.set('output', 'json');
  return url.href;
}

function parseSearchResponse(jsonText) {
  const data = JSON.parse(jsonText);
  const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];

  return docs
    .filter((doc) => typeof doc.identifier === 'string' && doc.identifier)
    .map((doc) => ({
      id: encodeArchiveId(doc.identifier),
      title: String(doc.title || doc.identifier),
      artist: Array.isArray(doc.creator) ? String(doc.creator[0] || 'Internet Archive') : String(doc.creator || 'Internet Archive'),
      source: 'Internet Archive',
    }));
}

async function searchArchiveSongs(query, deps = { httpGet }) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];
  const json = await deps.httpGet(archiveSearchUrl(normalizedQuery));
  return parseSearchResponse(json);
}

function chooseAudioFile(files) {
  const candidates = (Array.isArray(files) ? files : []).filter((file) => {
    const name = String(file.name || '');
    return AUDIO_EXTENSIONS.test(name) && !/^_/.test(name);
  });

  return (
    candidates.find((file) => /vbr mp3|mp3/i.test(String(file.format || ''))) ||
    candidates.find((file) => /\.mp3$/i.test(String(file.name || ''))) ||
    candidates[0] ||
    null
  );
}

function archiveFileUrl(identifier, fileName) {
  return `${ARCHIVE_BASE}/download/${encodeURIComponent(identifier)}/${fileName.split('/').map(encodeURIComponent).join('/')}`;
}

async function downloadArchiveSong(archiveId, outDir, deps) {
  const identifier = decodeArchiveId(archiveId);
  if (!identifier) {
    throw new Error('Invalid Internet Archive track id');
  }

  const transport = deps || {};
  const get = transport.httpGet || httpGet;
  const downloadBinary = transport.downloadBinary;
  if (typeof downloadBinary !== 'function') {
    throw new Error('Missing download transport');
  }

  const metadata = JSON.parse(await get(`${ARCHIVE_BASE}/metadata/${encodeURIComponent(identifier)}`));
  const file = chooseAudioFile(metadata.files);
  if (!file) {
    throw new Error('Internet Archive item has no downloadable audio file');
  }

  const title = String(metadata.metadata?.title || identifier);
  const artist = Array.isArray(metadata.metadata?.creator)
    ? String(metadata.metadata.creator[0] || 'Internet Archive')
    : String(metadata.metadata?.creator || 'Internet Archive');
  const artistDir = path.join(outDir, sanitize(artist) || 'Internet Archive');
  const extension = path.extname(file.name) || '.mp3';
  const filePath = path.join(artistDir, `${sanitize(title) || identifier} - ${sanitize(artist) || 'Internet Archive'}${extension}`);
  fs.mkdirSync(artistDir, { recursive: true });

  if (!fs.existsSync(filePath)) {
    await downloadBinary(archiveFileUrl(identifier, file.name), filePath);
  }

  return { filePath, title, artist, source: 'Internet Archive' };
}

module.exports = {
  ARCHIVE_ID_PREFIX,
  archiveSearchUrl,
  parseSearchResponse,
  searchArchiveSongs,
  downloadArchiveSong,
  decodeArchiveId,
  chooseAudioFile,
};
