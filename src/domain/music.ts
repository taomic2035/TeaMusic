export type TrackSource = 'catalog' | 'local' | 'resolved';
export type ResolveStatus = 'none' | 'queued' | 'resolving' | 'resolved' | 'failed';

export interface LyricLine {
  at: number;
  text: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  source: TrackSource;
  filePath?: string;
  audioUrl?: string;
  coverUrl?: string;
  lyrics?: LyricLine[];
  liked: boolean;
  playCount: number;
  lastPlayedAt?: string;
  skipCount?: number;
  lastSkippedAt?: string;
  tags: string[];
  resolveStatus: ResolveStatus;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResolverJob {
  id: string;
  query: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  trackId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

type BadgeInput = Pick<Track, 'source' | 'resolveStatus'>;
type FileLike = Pick<File, 'name' | 'type' | 'size'>;

export interface RecommendationCard {
  title: string;
  detail: string;
  tone: 'daily' | 'radio' | 'chart' | 'similar';
}

const allowedPureFeatures = new Set([
  'player',
  'library',
  'local-music',
  'recommendations',
  'favorites',
  'playlists',
  'lyrics',
  'queue',
  'background-resolver',
]);

export function getTrackBadge(track: BadgeInput): string | null {
  if (track.source === 'local') {
    return '本地';
  }

  if (track.resolveStatus === 'resolving' || track.resolveStatus === 'queued') {
    return '补全中';
  }

  if (track.source === 'resolved' || track.resolveStatus === 'resolved') {
    return '已补全';
  }

  if (track.resolveStatus === 'failed') {
    return '未补全';
  }

  return null;
}

export function isPureFeatureAllowed(feature: string): boolean {
  return allowedPureFeatures.has(feature);
}

export function createLocalTrackFromFile(file: FileLike, now: string, audioUrl?: string): Track {
  const cleanName = file.name.replace(/\.[^.]+$/, '');
  const { title, artist } = parseTrackName(cleanName, '本地音乐');

  return {
    id: `local:${now}:${file.name}:${file.size}`,
    title,
    artist,
    source: 'local',
    audioUrl,
    liked: false,
    playCount: 0,
    tags: ['local'],
    resolveStatus: 'none',
    lastPlayedAt: now,
  };
}

export function createLocalTrackFromPath(filePath: string, now: string): Track {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const filename = normalizedPath.split('/').pop()?.replace(/\.[^.]+$/, '') || '本地音乐';
  const artistFolder = normalizedPath.split('/').at(-2);
  const { title, artist } = parseTrackName(filename, artistFolder || '本地音乐');

  return {
    id: `local:path:${normalizedPath}`,
    title,
    artist,
    album: artistFolder,
    source: 'local',
    filePath,
    audioUrl: toFileAudioUrl(filePath),
    liked: false,
    playCount: 0,
    tags: ['local'],
    resolveStatus: 'none',
    lastPlayedAt: now,
  };
}

export function createResolvedTrackFromPath(filePath: string, now: string): Track {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const filename = normalizedPath.split('/').pop()?.replace(/\.[^.]+$/, '') || '已补全歌曲';
  const artistFolder = normalizedPath.split('/').at(-2);
  const { title, artist } = parseTrackName(filename, artistFolder || '曲库补全');

  return {
    id: `resolved:path:${normalizedPath}`,
    title,
    artist,
    album: artistFolder,
    source: 'resolved',
    filePath,
    audioUrl: toFileAudioUrl(filePath),
    liked: false,
    playCount: 0,
    tags: ['resolved'],
    resolveStatus: 'resolved',
    lastPlayedAt: now,
  };
}

function parseTrackName(name: string, fallbackArtist: string): { title: string; artist: string } {
  const [, parsedTitle, parsedArtist] = name.match(/^(.+?)\s*[-–—]\s*(.+)$/) ?? [];

  return {
    title: parsedTitle?.trim() || name.trim(),
    artist: parsedArtist?.trim() || fallbackArtist,
  };
}

export function toFileAudioUrl(filePath: string): string {
  const forward = filePath.replace(/\\/g, '/');
  const url = forward.startsWith('/') ? `file://${forward}` : `file:///${forward}`;
  return encodeURI(url);
}

export function filterTracks(tracks: Track[], query: string): Track[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return tracks;
  }

  return tracks.filter((track) => {
    const haystack = [track.title, track.artist, track.album, ...track.tags].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

export function createResolverJob(query: string, now: string): ResolverJob {
  return {
    id: `resolver:${now}:${query}`,
    query: query.trim(),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };
}

export function getResolverSummary(jobs: ResolverJob[]): string {
  const queuedCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;

  if (queuedCount > 0) {
    return `曲库补全：${queuedCount} 首排队中`;
  }

  const succeededCount = jobs.filter((job) => job.status === 'succeeded').length;

  if (succeededCount > 0) {
    return `曲库补全：已补全 ${succeededCount} 首`;
  }

  const failedCount = jobs.filter((job) => job.status === 'failed').length;

  if (failedCount > 0) {
    return `曲库补全：${failedCount} 首失败`;
  }

  return '曲库补全：空闲';
}

export function getAdjacentTrackId(trackIds: string[], currentTrackId: string, direction: 'previous' | 'next'): string | null {
  if (trackIds.length === 0) {
    return null;
  }

  const currentIndex = trackIds.indexOf(currentTrackId);

  if (currentIndex === -1) {
    return direction === 'next' ? trackIds[0] : trackIds[trackIds.length - 1];
  }

  const offset = direction === 'next' ? 1 : -1;
  const nextIndex = (currentIndex + offset + trackIds.length) % trackIds.length;

  return trackIds[nextIndex];
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function parseLrc(content: string): LyricLine[] {
  return content
    .split(/\r?\n/)
    .flatMap((line) => {
      const timestamps = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
      const text = line.replace(/\[[^\]]+\]/g, '').trim();

      if (timestamps.length === 0 || !text) {
        return [];
      }

      return timestamps.map((timestamp) => {
        const minutes = Number(timestamp[1]);
        const seconds = Number(timestamp[2]);
        const fraction = timestamp[3] ? Number(`0.${timestamp[3].padEnd(3, '0')}`) : 0;

        return {
          at: minutes * 60 + seconds + fraction,
          text,
        };
      });
    })
    .sort((firstLine, secondLine) => firstLine.at - secondLine.at);
}

export function buildRecommendationCards(tracks: Track[]): RecommendationCard[] {
  const localCount = tracks.filter((track) => track.source === 'local').length;
  const resolvedCount = tracks.filter((track) => track.source === 'resolved' || track.resolveStatus === 'resolved').length;
  const likedCount = tracks.filter((track) => track.liked).length;
  const activeCount = tracks.filter((track) => track.playCount > 0).length;

  return [
    {
      title: '每日推荐',
      detail: `${tracks.length} 首 · 混合在线、已补全与本地收藏`,
      tone: 'daily',
    },
    {
      title: '场景电台',
      detail: `${localCount} 首本地 · 工作、夜晚、通勤、放空`,
      tone: 'radio',
    },
    {
      title: '热歌榜',
      detail: `${resolvedCount} 首已补全 · ${activeCount} 首最近播放`,
      tone: 'chart',
    },
    {
      title: '同频推荐',
      detail: `从 ${likedCount} 首喜欢继续延展`,
      tone: 'similar',
    },
  ];
}

export function buildSimilarTrackIds(tracks: Track[], currentTrack: Track, limit = 12): string[] {
  const currentTags = new Set(currentTrack.tags);

  return tracks
    .filter((track) => track.id !== currentTrack.id)
    .filter((track) => track.liked || (track.skipCount ?? 0) === 0)
    .map((track) => {
      const sharedTagCount = track.tags.filter((tag) => currentTags.has(tag)).length;
      const score =
        sharedTagCount * 8 +
        (track.source === currentTrack.source ? 2 : 0) +
        (track.liked ? 2 : 0) +
        Math.min(track.playCount, 12) / 12;

      return { id: track.id, score, sharedTagCount };
    })
    .filter((candidate) => candidate.sharedTagCount > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map((candidate) => candidate.id);
}

export function markTrackPlayed(track: Track, playedAt: string): Track {
  return {
    ...track,
    playCount: track.playCount + 1,
    lastPlayedAt: playedAt,
  };
}

export function markTrackSkipped(track: Track, skippedAt: string): Track {
  return {
    ...track,
    skipCount: (track.skipCount ?? 0) + 1,
    lastSkippedAt: skippedAt,
  };
}
