import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Electron music library helpers', () => {
  it('collects audio files from selected folders and files', () => {
    const { collectAudioFilesFromSelection } = require('./music-library.cjs') as {
      collectAudioFilesFromSelection(paths: string[]): string[];
    };
    const root = mkdtempSync(join(tmpdir(), 'tea-music-library-'));
    const album = join(root, 'Album');
    const nested = join(album, 'Disc 1');
    mkdirSync(nested, { recursive: true });
    const directTrack = join(root, '玻璃夜航-Taomic.m4a');
    const nestedTrack = join(nested, '感谢你爱我-本地收藏.flac');
    const note = join(nested, 'cover.txt');
    writeFileSync(directTrack, 'audio');
    writeFileSync(nestedTrack, 'audio');
    writeFileSync(note, 'not audio');

    expect(collectAudioFilesFromSelection([root, directTrack])).toEqual(
      [directTrack, nestedTrack].sort((left, right) => left.localeCompare(right)),
    );
  });

  it('collects Mac lossless audio formats from selected folders', () => {
    const { collectAudioFilesFromSelection } = require('./music-library.cjs') as {
      collectAudioFilesFromSelection(paths: string[]): string[];
    };
    const root = mkdtempSync(join(tmpdir(), 'tea-music-mac-audio-'));
    const aiffTrack = join(root, '母带现场-Taomic.aiff');
    const alacTrack = join(root, '无损收藏-Taomic.alac');
    writeFileSync(aiffTrack, 'audio');
    writeFileSync(alacTrack, 'audio');

    expect(collectAudioFilesFromSelection([root])).toEqual([aiffTrack, alacTrack].sort((left, right) => left.localeCompare(right)));
  });

  it('reads same-name sidecar LRC files for local lyrics', () => {
    const { readSidecarLyrics } = require('./music-library.cjs') as {
      readSidecarLyrics(path: string): string | null;
    };
    const root = mkdtempSync(join(tmpdir(), 'tea-music-lyrics-'));
    const track = join(root, '玻璃夜航-Taomic.flac');
    const lyric = join(root, '玻璃夜航-Taomic.lrc');
    writeFileSync(track, 'audio');
    writeFileSync(lyric, '[00:01.00]把歌词放回播放器');

    expect(readSidecarLyrics(track)).toBe('[00:01.00]把歌词放回播放器');
  });

  it('finds sidecar cover artwork for local tracks', () => {
    const { readSidecarArtwork } = require('./music-library.cjs') as {
      readSidecarArtwork(path: string): string | null;
    };
    const root = mkdtempSync(join(tmpdir(), 'tea-music-artwork-'));
    const track = join(root, '玻璃夜航-Taomic.flac');
    const cover = join(root, '玻璃夜航-Taomic.jpg');
    writeFileSync(track, 'audio');
    writeFileSync(cover, 'image');

    expect(readSidecarArtwork(track)).toBe(encodeURI(`file://${cover}`));
  });
});
