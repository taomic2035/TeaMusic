import { describe, expect, it } from 'vitest';
import {
  createLocalTrackFromFile,
  createLocalTrackFromPath,
  createResolvedTrackFromPath,
  createResolverJob,
  buildRecommendationCards,
  buildSimilarTrackIds,
  filterTracks,
  formatPlaybackTime,
  getAdjacentTrackId,
  getResolverSummary,
  getTrackBadge,
  isPureFeatureAllowed,
  markTrackPlayed,
  markTrackSkipped,
  parseLrc,
  toFileAudioUrl,
} from './music';

describe('music domain rules', () => {
  it('marks local and background-resolved tracks', () => {
    expect(getTrackBadge({ source: 'local', resolveStatus: 'none' })).toBe('本地');
    expect(getTrackBadge({ source: 'resolved', resolveStatus: 'resolved' })).toBe('已补全');
    expect(getTrackBadge({ source: 'catalog', resolveStatus: 'resolving' })).toBe('补全中');
    expect(getTrackBadge({ source: 'catalog', resolveStatus: 'none' })).toBeNull();
  });

  it('allows only listening and library features', () => {
    expect(isPureFeatureAllowed('player')).toBe(true);
    expect(isPureFeatureAllowed('library')).toBe(true);
    expect(isPureFeatureAllowed('local-music')).toBe(true);
    expect(isPureFeatureAllowed('recommendations')).toBe(true);
    expect(isPureFeatureAllowed('comments')).toBe(false);
    expect(isPureFeatureAllowed('membership')).toBe(false);
    expect(isPureFeatureAllowed('download-center')).toBe(false);
    expect(isPureFeatureAllowed('publish-video')).toBe(false);
  });

  it('creates local audio tracks with a persistent local badge', () => {
    const track = createLocalTrackFromFile(
      new File(['audio'], '感谢你爱我 - 本地收藏.mp3', { type: 'audio/mpeg' }),
      '2026-06-06T12:00:00.000Z',
    );

    expect(track.title).toBe('感谢你爱我');
    expect(track.artist).toBe('本地收藏');
    expect(track.source).toBe('local');
    expect(getTrackBadge(track)).toBe('本地');
  });

  it('creates local audio tracks from native file paths', () => {
    const track = createLocalTrackFromPath('/Users/taomic/Music/TeaMusic/Local/夜晚散步-Taomic.flac', '2026-06-06T12:00:00.000Z');

    expect(track.title).toBe('夜晚散步');
    expect(track.artist).toBe('Taomic');
    expect(track.album).toBe('Local');
    expect(track.source).toBe('local');
    expect(track.filePath).toBe('/Users/taomic/Music/TeaMusic/Local/夜晚散步-Taomic.flac');
    expect(getTrackBadge(track)).toBe('本地');
  });

  it('searches native tracks by their parent folder album', () => {
    const track = createLocalTrackFromPath('/Users/taomic/Music/TeaMusic/Local/深夜收藏/玻璃夜航-Taomic.m4a', '2026-06-06T12:00:00.000Z');

    expect(track.album).toBe('深夜收藏');
    expect(filterTracks([track], '深夜收藏')).toEqual([track]);
  });

  it('uses stable ids for restored native file paths', () => {
    const localTrack = createLocalTrackFromPath('/Users/taomic/Music/TeaMusic/Local/夜晚散步-Taomic.flac', '2026-06-06T12:00:00.000Z');
    const sameLocalTrack = createLocalTrackFromPath('/Users/taomic/Music/TeaMusic/Local/夜晚散步-Taomic.flac', '2026-06-07T12:00:00.000Z');
    const resolvedTrack = createResolvedTrackFromPath('/Users/taomic/Music/TeaMusic/Resolved/歌手/真实歌名-歌手.mp3', '2026-06-06T12:00:00.000Z');
    const sameResolvedTrack = createResolvedTrackFromPath('/Users/taomic/Music/TeaMusic/Resolved/歌手/真实歌名-歌手.mp3', '2026-06-07T12:00:00.000Z');

    expect(sameLocalTrack.id).toBe(localTrack.id);
    expect(sameResolvedTrack.id).toBe(resolvedTrack.id);
  });

  it('builds three-slash file urls for windows and posix paths', () => {
    expect(toFileAudioUrl('D:/Music/TeaMusic/Resolved/周杰伦/晴天-周杰伦.mp3')).toBe(
      'file:///D:/Music/TeaMusic/Resolved/%E5%91%A8%E6%9D%B0%E4%BC%A6/%E6%99%B4%E5%A4%A9-%E5%91%A8%E6%9D%B0%E4%BC%A6.mp3',
    );
    expect(toFileAudioUrl('D:\\Music\\x-y.mp3')).toBe('file:///D:/Music/x-y.mp3');
    expect(toFileAudioUrl('/Users/taomic/Music/x-y.mp3')).toBe('file:///Users/taomic/Music/x-y.mp3');
  });

  it('encodes native file urls without changing stable path ids', () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/夜晚 散步-Taomic.flac';
    const track = createLocalTrackFromPath(filePath, '2026-06-06T12:00:00.000Z');

    expect(track.id).toBe(`local:path:${filePath}`);
    expect(track.audioUrl).toContain('%20');
    expect(track.audioUrl).not.toContain('夜晚 散步');
  });

  it('creates resolved tracks from background files', () => {
    const track = createResolvedTrackFromPath(
      '/Users/taomic/Music/TeaMusic/Resolved/Tizzy T/当发现互相都在躲-Tizzy T.mp3',
      '2026-06-06T12:00:02.000Z',
    );

    expect(track.title).toBe('当发现互相都在躲');
    expect(track.artist).toBe('Tizzy T');
    expect(track.source).toBe('resolved');
    expect(getTrackBadge(track)).toBe('已补全');
  });

  it('filters the unified library and summarizes hidden resolver jobs', () => {
    const tracks = [
      createLocalTrackFromFile(new File(['audio'], '晴夜漫游 - 本地收藏.flac'), '2026-06-06T12:00:00.000Z'),
      createLocalTrackFromFile(new File(['audio'], '感谢你爱我 - 本地收藏.mp3'), '2026-06-06T12:00:00.000Z'),
    ];
    const job = createResolverJob('当发现互相都在躲', '2026-06-06T12:00:01.000Z');

    expect(filterTracks(tracks, '晴夜')).toHaveLength(1);
    expect(filterTracks(tracks, '本地收藏')).toHaveLength(2);
    expect(getResolverSummary([job])).toBe('曲库补全：1 首排队中');
    expect(getResolverSummary([{ ...job, status: 'failed' }])).toBe('曲库补全：1 首失败');
  });

  it('wraps queue navigation and formats playback time', () => {
    const ids = ['track-1', 'track-2', 'track-3'];

    expect(getAdjacentTrackId(ids, 'track-1', 'previous')).toBe('track-3');
    expect(getAdjacentTrackId(ids, 'track-1', 'next')).toBe('track-2');
    expect(getAdjacentTrackId(ids, 'track-3', 'next')).toBe('track-1');
    expect(getAdjacentTrackId(ids, 'missing-track', 'next')).toBe('track-1');
    expect(getAdjacentTrackId(ids, 'missing-track', 'previous')).toBe('track-3');
    expect(formatPlaybackTime(65)).toBe('1:05');
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00');
  });

  it('parses sidecar LRC lyrics into timed lyric lines', () => {
    expect(parseLrc('[00:01.20]第一句歌词\n[01:02.50]第二句歌词\n[by:TeaMusic]')).toEqual([
      { at: 1.2, text: '第一句歌词' },
      { at: 62.5, text: '第二句歌词' },
    ]);
  });

  it('builds recommendation cards from library state', () => {
    const tracks = [
      createLocalTrackFromFile(new File(['audio'], '夜晚散步 - Taomic.mp3'), '2026-06-06T12:00:00.000Z'),
      createResolvedTrackFromPath('/Users/taomic/Music/TeaMusic/Resolved/歌手/真实歌名-歌手.mp3', '2026-06-06T12:00:01.000Z'),
    ];
    tracks[0].liked = true;
    tracks[1].playCount = 9;

    const cards = buildRecommendationCards(tracks);

    expect(cards[0].detail).toBe('2 首 · 混合在线、已补全与本地收藏');
    expect(cards[1].detail).toContain('1 首本地');
    expect(cards[2].detail).toContain('1 首已补全');
    expect(cards[3].detail).toContain('从 1 首喜欢继续延展');
  });

  it('builds a similar queue from tags and listening signals', () => {
    const current = createLocalTrackFromFile(new File(['audio'], '感谢你爱我 - 本地收藏.mp3'), '2026-06-06T12:00:00.000Z');
    const close = createLocalTrackFromFile(new File(['audio'], '晴夜漫游 - 推荐曲库.mp3'), '2026-06-06T12:00:01.000Z');
    const far = createResolvedTrackFromPath('/Users/taomic/Music/TeaMusic/Resolved/Tizzy T/当发现互相都在躲-Tizzy T.mp3', '2026-06-06T12:00:02.000Z');
    current.id = 'current';
    current.tags = ['local', 'night'];
    close.id = 'close';
    close.tags = ['night', 'relax'];
    far.id = 'far';
    far.tags = ['hiphop'];
    far.playCount = 20;

    expect(buildSimilarTrackIds([current, far, close], current)).toEqual(['close']);
  });

  it('uses skipped tracks as negative recommendation signals', () => {
    const current = createLocalTrackFromFile(new File(['audio'], '感谢你爱我 - 本地收藏.mp3'), '2026-06-06T12:00:00.000Z');
    const skipped = createLocalTrackFromFile(new File(['audio'], '晴夜漫游 - 推荐曲库.mp3'), '2026-06-06T12:00:01.000Z');
    current.id = 'current';
    current.tags = ['local', 'night'];
    skipped.id = 'skipped';
    skipped.tags = ['night', 'relax'];

    const skippedTrack = markTrackSkipped(skipped, '2026-06-06T12:05:00.000Z');

    expect(skippedTrack.skipCount).toBe(1);
    expect(skippedTrack.lastSkippedAt).toBe('2026-06-06T12:05:00.000Z');
    expect(buildSimilarTrackIds([current, skippedTrack], current)).toEqual([]);
  });

  it('marks a track as played for recommendation signals', () => {
    const track = createLocalTrackFromFile(new File(['audio'], '夜晚散步 - Taomic.mp3'), '2026-06-06T12:00:00.000Z');
    const played = markTrackPlayed(track, '2026-06-06T12:05:00.000Z');

    expect(played.playCount).toBe(1);
    expect(played.lastPlayedAt).toBe('2026-06-06T12:05:00.000Z');
  });
});
