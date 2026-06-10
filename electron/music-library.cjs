const fs = require('node:fs');
const path = require('node:path');

const audioExtensionPattern = /\.(mp3|flac|wav|m4a|aac|ogg|aif|aiff|alac)$/i;
const artworkExtensions = ['jpg', 'jpeg', 'png', 'webp'];

function listAudioFiles(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const stats = fs.statSync(rootPath);

  if (stats.isFile()) {
    return audioExtensionPattern.test(rootPath) ? [rootPath] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  return entries.flatMap((entry) => listAudioFiles(path.join(rootPath, entry.name)));
}

function collectAudioFilesFromSelection(selectedPaths) {
  return Array.from(new Set(selectedPaths.flatMap((selectedPath) => listAudioFiles(selectedPath)))).sort((left, right) =>
    left.localeCompare(right),
  );
}

function readSidecarLyrics(filePath) {
  const parsedPath = path.parse(filePath);
  const lyricPath = path.join(parsedPath.dir, `${parsedPath.name}.lrc`);

  if (!fs.existsSync(lyricPath)) {
    return null;
  }

  return fs.readFileSync(lyricPath, 'utf8');
}

function toFileUrl(filePath) {
  const forward = filePath.replace(/\\/g, '/');
  const url = forward.startsWith('/') ? `file://${forward}` : `file:///${forward}`;
  return encodeURI(url);
}

function readSidecarArtwork(filePath) {
  const parsedPath = path.parse(filePath);
  const candidates = [
    ...artworkExtensions.map((extension) => path.join(parsedPath.dir, `${parsedPath.name}.${extension}`)),
    ...artworkExtensions.flatMap((extension) => [
      path.join(parsedPath.dir, `cover.${extension}`),
      path.join(parsedPath.dir, `folder.${extension}`),
    ]),
  ];
  const artworkPath = candidates.find((candidate) => fs.existsSync(candidate));

  return artworkPath ? toFileUrl(artworkPath) : null;
}

module.exports = {
  audioExtensionPattern,
  collectAudioFilesFromSelection,
  listAudioFiles,
  readSidecarArtwork,
  readSidecarLyrics,
  toFileUrl,
};
