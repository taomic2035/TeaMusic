import {
  Download,
  FolderOpen,
  SlidersHorizontal,
  Search,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { ChangeEvent, CSSProperties, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ImmersivePlayer } from './components/ImmersivePlayer';
import { LibraryDrawer } from './components/LibraryDrawer';
import { LyricStage } from './components/LyricStage';
import {
  Track,
  createLocalTrackFromFile,
  createLocalTrackFromPath,
  createResolvedTrackFromPath,
  filterTracks,
  getAdjacentTrackId,
  markTrackPlayed,
  markTrackSkipped,
  parseLrc,
} from './domain/music';
import { useDominantTheme } from './hooks/useDominantTheme';

type PlaybackMode = 'queue' | 'repeat-one' | 'shuffle';
type FinderSong = { id: string; title: string; artist: string };
type FinderVerification = {
  type: 'search' | 'download';
  songId?: string;
  title: string;
  verifyUrl: string;
};

const mediaSessionActions = ['play', 'pause', 'previoustrack', 'nexttrack'] satisfies MediaSessionAction[];

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

const seedCoverUrl =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 240 240%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop stop-color=%22%2311d76c%22/%3E%3Cstop offset=%220.55%22 stop-color=%22%23d8ee8b%22/%3E%3Cstop offset=%221%22 stop-color=%22%237177ff%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%22240%22 height=%22240%22 rx=%2236%22 fill=%22url(%23g)%22/%3E%3Ccircle cx=%2282%22 cy=%22156%22 r=%2230%22 fill=%22rgba(12,18,15,.8)%22/%3E%3Cpath d=%22M112 154V58l64 28v34l-38-18v52a30 30 0 1 1-26 0Z%22 fill=%22rgba(12,18,15,.82)%22/%3E%3C/svg%3E';

const initialTracks: Track[] = [
  {
    id: 'local:seed:thanks',
    title: '感谢你爱我',
    artist: '本地收藏',
    source: 'local',
    liked: true,
    playCount: 18,
    tags: ['local', 'night'],
    resolveStatus: 'none',
    coverUrl: seedCoverUrl,
    lyrics: [
      { at: 0, text: '把今天调成慢速播放' },
      { at: 12, text: '让玻璃里的光轻轻晃' },
      { at: 25, text: '感谢你爱我，也感谢这首歌还在' },
    ],
  },
  {
    id: 'resolved:seed:hiding',
    title: '当发现互相都在躲',
    artist: 'Tizzy T',
    source: 'resolved',
    liked: false,
    playCount: 0,
    tags: ['resolved', 'hiphop'],
    resolveStatus: 'resolved',
    lyrics: [
      { at: 0, text: '当发现互相都在躲' },
      { at: 14, text: '节奏把沉默推向前' },
      { at: 29, text: '补全后的歌也回到同一个队列' },
    ],
  },
  {
    id: 'catalog:seed:walk',
    title: '晴夜漫游',
    artist: '推荐曲库',
    source: 'catalog',
    liked: false,
    playCount: 13,
    tags: ['radio', 'relax', 'night'],
    resolveStatus: 'none',
    lyrics: [
      { at: 0, text: '晴夜漫游，城市轻一点' },
      { at: 16, text: '推荐从最近播放里长出来' },
      { at: 31, text: '下一首不用刻意思考' },
    ],
  },
];

const likedTrackStorageKey = 'teaMusic:likedTrackIds';
const trackStatsStorageKey = 'teaMusic:trackStats';
const currentTrackStorageKey = 'teaMusic:currentTrackId';
const volumeStorageKey = 'teaMusic:volume';
const playbackModeStorageKey = 'teaMusic:playbackMode';
const sourceVerificationBlockedMessage = '源站真人检测未放行，未下载。请稍后重试或换一个来源';

type StoredTrackStats = Record<string, { playCount?: number; lastPlayedAt?: string; skipCount?: number; lastSkippedAt?: string }>;

function readStoredLikedTrackIds(): Set<string> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(likedTrackStorageKey);

  if (rawValue === null) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? new Set(parsedValue.filter((id): id is string => typeof id === 'string')) : null;
  } catch {
    return null;
  }
}

function restoreLikedTracks(tracks: Track[]): Track[] {
  const likedTrackIds = readStoredLikedTrackIds();

  if (likedTrackIds === null) {
    return tracks;
  }

  return tracks.map((track) => ({ ...track, liked: likedTrackIds.has(track.id) }));
}

function readStoredTrackStats(): StoredTrackStats | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(trackStatsStorageKey);

  if (rawValue === null) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue) ? (parsedValue as StoredTrackStats) : null;
  } catch {
    return null;
  }
}

function restoreTrackStats(tracks: Track[]): Track[] {
  const storedStats = readStoredTrackStats();

  if (storedStats === null) {
    return tracks;
  }

  return tracks.map((track) => {
    const trackStats = storedStats[track.id];

    if (!trackStats) {
      return track;
    }

    return {
      ...track,
      lastPlayedAt: typeof trackStats.lastPlayedAt === 'string' ? trackStats.lastPlayedAt : track.lastPlayedAt,
      lastSkippedAt: typeof trackStats.lastSkippedAt === 'string' ? trackStats.lastSkippedAt : track.lastSkippedAt,
      playCount: Number.isFinite(trackStats.playCount) ? Number(trackStats.playCount) : track.playCount,
      skipCount: Number.isFinite(trackStats.skipCount) ? Number(trackStats.skipCount) : track.skipCount,
    };
  });
}

function restorePersistedTrackState(tracks: Track[]): Track[] {
  return restoreTrackStats(restoreLikedTracks(tracks));
}

function persistLikedTrackIds(tracks: Track[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      likedTrackStorageKey,
      JSON.stringify(tracks.filter((track) => track.liked).map((track) => track.id)),
    );
  } catch {
    // Local storage is a convenience cache; playback should still work if it is unavailable.
  }
}

function persistTrackStats(tracks: Track[]) {
  if (typeof window === 'undefined') {
    return;
  }

  const stats = tracks.reduce<StoredTrackStats>((storedStats, track) => {
    if (track.playCount > 0 || track.lastPlayedAt || (track.skipCount ?? 0) > 0 || track.lastSkippedAt) {
      storedStats[track.id] = {
        lastPlayedAt: track.lastPlayedAt,
        lastSkippedAt: track.lastSkippedAt,
        playCount: track.playCount,
        skipCount: track.skipCount,
      };
    }

    return storedStats;
  }, {});

  try {
    window.localStorage.setItem(trackStatsStorageKey, JSON.stringify(stats));
  } catch {
    // Listening signals are best-effort; recommendations still work from the current session.
  }
}

function restoreCurrentTrackId(tracks: Track[]): string {
  if (typeof window === 'undefined') {
    return tracks[0].id;
  }

  const storedTrackId = readStoredCurrentTrackId();
  return storedTrackId && tracks.some((track) => track.id === storedTrackId) ? storedTrackId : tracks[0].id;
}

function readStoredCurrentTrackId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(currentTrackStorageKey);
}

function restoreVolume(): number {
  if (typeof window === 'undefined') {
    return 70;
  }

  const storedValue = window.localStorage.getItem(volumeStorageKey);

  if (storedValue === null) {
    return 70;
  }

  const storedVolume = Number(storedValue);
  return Number.isFinite(storedVolume) ? Math.min(Math.max(storedVolume, 0), 100) : 70;
}

function restorePlaybackMode(): PlaybackMode {
  if (typeof window === 'undefined') {
    return 'queue';
  }

  const storedValue = window.localStorage.getItem(playbackModeStorageKey);
  return storedValue === 'repeat-one' || storedValue === 'shuffle' || storedValue === 'queue' ? storedValue : 'queue';
}

function persistScalarPreference(key: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preferences are best-effort only.
  }
}

function mergeTracksById(nextTracks: Track[], existingTracks: Track[]): Track[] {
  const existingIds = new Set(existingTracks.map((track) => track.id));
  return [...nextTracks.filter((track) => !existingIds.has(track.id)), ...existingTracks];
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreFinderSong(song: FinderSong, query: string): number {
  const title = normalizeMatchText(song.title);
  const artist = normalizeMatchText(song.artist);
  const normalizedQuery = normalizeMatchText(query);
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const combined = `${title} ${artist}`.trim();
  let score = 0;

  if (!normalizedQuery) {
    return score;
  }

  if (combined === normalizedQuery) score += 260;
  if (title === normalizedQuery) score += 180;
  if (artist === normalizedQuery) score += 80;

  tokens.forEach((token) => {
    if (title === token) score += 90;
    else if (title.includes(token)) score += 45;

    if (artist === token) score += 75;
    else if (artist.includes(token)) score += 35;

    if (combined.includes(token)) score += 10;
  });

  return score;
}

function chooseBestFinderSong(songs: FinderSong[], query: string): FinderSong | null {
  return (
    songs
      .map((song, index) => ({ song, index, score: scoreFinderSong(song, query) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.song ?? null
  );
}

export function App() {
  const [tracks, setTracks] = useState(() => restorePersistedTrackState(initialTracks));
  const [query, setQuery] = useState('');
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  const [finderQuery, setFinderQuery] = useState('');
  const [finderResults, setFinderResults] = useState<FinderSong[]>([]);
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderError, setFinderError] = useState('');
  const [finderVerification, setFinderVerification] = useState<FinderVerification | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState(() => restoreCurrentTrackId(initialTracks));
  const [hasCompletedLibraryRestore, setHasCompletedLibraryRestore] = useState(
    () => typeof window === 'undefined' || !window.teaMusicBackend,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTrackMenuOpen, setIsTrackMenuOpen] = useState(false);
  const [isLyricsFullscreenOpen, setIsLyricsFullscreenOpen] = useState(false);
  const [isLibraryDrawerOpen, setIsLibraryDrawerOpen] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());
  const [isDragActive, setIsDragActive] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(restorePlaybackMode);
  const [playbackTime, setPlaybackTime] = useState({ current: 76, duration: 181 });
  const [volume, setVolume] = useState(restoreVolume);
  const audioRef = useRef<HTMLAudioElement>(null);
  const storedCurrentTrackIdRef = useRef(readStoredCurrentTrackId());
  const previousTrackIdRef = useRef(currentTrackId);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);

  const filteredTracks = useMemo(() => filterTracks(tracks, query), [tracks, query]);
  const playbackQueue = useMemo(() => (filteredTracks.length > 0 ? filteredTracks : tracks), [filteredTracks, tracks]);
  const currentTrack = tracks.find((track) => track.id === currentTrackId) ?? tracks[0];
  const canRemoveCurrentLocalTrack = currentTrack.source === 'local' && Boolean(currentTrack.filePath || currentTrack.audioUrl);
  const canRevealCurrentLocalTrack = Boolean(currentTrack.filePath && window.teaMusicBackend?.revealLocalAudioFile);
  const coverTheme = useDominantTheme(currentTrack.coverUrl);
  const shellStyle = {
    ...coverTheme,
    ...(currentTrack.coverUrl ? { '--app-cover': `url("${currentTrack.coverUrl}")` } : {}),
  } as CSSProperties;

  useEffect(() => {
    let isMounted = true;

    async function restoreLibraries() {
      let resolvedPaths: string[] = [];
      let localPaths: string[] = [];

      const [resolvedScan, localScan] = await Promise.allSettled([
        window.teaMusicBackend?.scanResolvedLibrary?.(),
        window.teaMusicBackend?.scanLocalLibrary?.(),
      ]);

      if (resolvedScan.status === 'fulfilled' && Array.isArray(resolvedScan.value)) {
        resolvedPaths = resolvedScan.value;
      }

      if (localScan.status === 'fulfilled' && Array.isArray(localScan.value)) {
        localPaths = localScan.value;
      }

      if (!isMounted) {
        return;
      }

      const restoredTracks = restorePersistedTrackState([
        ...localPaths.map((filePath) => createLocalTrackFromPath(filePath, new Date().toISOString())),
        ...resolvedPaths.map((filePath) => createResolvedTrackFromPath(filePath, new Date().toISOString())),
      ]);

      if (restoredTracks.length === 0) {
        setHasCompletedLibraryRestore(true);
        return;
      }

      setTracks((existingTracks) => {
        const existingPaths = new Set(existingTracks.map((track) => track.filePath).filter(Boolean));
        const freshTracks = restoredTracks.filter((track) => !existingPaths.has(track.filePath));
        return [...freshTracks, ...existingTracks];
      });

      if (storedCurrentTrackIdRef.current && restoredTracks.some((track) => track.id === storedCurrentTrackIdRef.current)) {
        setCurrentTrackId(storedCurrentTrackIdRef.current);
      }

      setHasCompletedLibraryRestore(true);
    }

    void restoreLibraries();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasCompletedLibraryRestore) {
      return;
    }

    persistLikedTrackIds(tracks);
    persistTrackStats(tracks);
  }, [hasCompletedLibraryRestore, tracks]);

  useEffect(() => {
    persistScalarPreference(currentTrackStorageKey, currentTrackId);
  }, [currentTrackId]);

  useEffect(() => {
    persistScalarPreference(volumeStorageKey, String(volume));
  }, [volume]);

  useEffect(() => {
    persistScalarPreference(playbackModeStorageKey, playbackMode);
  }, [playbackMode]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;
    const metadataInit: MediaMetadataInit = {
      album: currentTrack.album ?? currentTrack.artist,
      artist: currentTrack.artist,
      title: currentTrack.title,
      artwork: currentTrack.coverUrl
        ? [
            {
              src: currentTrack.coverUrl,
              sizes: '240x240',
              type: currentTrack.coverUrl.startsWith('data:image/svg+xml') ? 'image/svg+xml' : 'image/*',
            },
          ]
        : [],
    };

    mediaSession.metadata =
      typeof MediaMetadata === 'function' ? new MediaMetadata(metadataInit) : (metadataInit as unknown as MediaMetadata);
    mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    mediaSession.setActionHandler('play', () => {
      if (!isPlaying) {
        void togglePlayback();
      }
    });
    mediaSession.setActionHandler('pause', pausePlayback);
    mediaSession.setActionHandler('previoustrack', () => moveInQueue('previous'));
    mediaSession.setActionHandler('nexttrack', skipToNextTrack);

    return () => {
      mediaSessionActions.forEach((action) => mediaSession.setActionHandler(action, null));
    };
  });

  useEffect(() => {
    if (!currentTrack.filePath || currentTrack.coverUrl || !window.teaMusicBackend?.readLocalArtwork) {
      return;
    }

    let isMounted = true;

    async function loadArtwork() {
      const coverUrl = await window.teaMusicBackend?.readLocalArtwork?.(currentTrack.filePath ?? '');

      if (!isMounted || !coverUrl) {
        return;
      }

      setTracks((existingTracks) =>
        existingTracks.map((track) => (track.id === currentTrack.id ? { ...track, coverUrl } : track)),
      );
    }

    void loadArtwork();

    return () => {
      isMounted = false;
    };
  }, [currentTrack.coverUrl, currentTrack.filePath, currentTrack.id]);

  useEffect(() => {
    if (!currentTrack.filePath || currentTrack.lyrics || !window.teaMusicBackend?.readLocalLyrics) {
      return;
    }

    let isMounted = true;

    async function loadLyrics() {
      const lyricContent = await window.teaMusicBackend?.readLocalLyrics?.(currentTrack.filePath ?? '');

      if (!isMounted || !lyricContent) {
        return;
      }

      const parsedLyrics = parseLrc(lyricContent);

      if (parsedLyrics.length === 0) {
        return;
      }

      setTracks((existingTracks) =>
        existingTracks.map((track) => (track.id === currentTrack.id ? { ...track, lyrics: parsedLyrics } : track)),
      );
    }

    void loadLyrics();

    return () => {
      isMounted = false;
    };
  }, [currentTrack.filePath, currentTrack.id, currentTrack.lyrics]);

  useEffect(() => {
    const trackChanged = previousTrackIdRef.current !== currentTrackId;
    previousTrackIdRef.current = currentTrackId;

    if (!trackChanged || !isPlaying || !currentTrack.audioUrl || !audioRef.current) {
      return;
    }

    const playResult = audioRef.current.play?.();

    if (playResult && 'catch' in playResult) {
      void playResult.catch(() => setIsPlaying(false));
    }
  }, [currentTrack.audioUrl, currentTrackId, isPlaying]);

  function importLocalFiles(files: File[]) {
    const audioTracks = files
      .filter((file) => file.type.startsWith('audio/') || /\.(mp3|flac|wav|m4a|aac|ogg|aif|aiff|alac)$/i.test(file.name))
      .map((file) => {
        const objectUrl =
          typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined;
        return createLocalTrackFromFile(file, new Date().toISOString(), objectUrl);
      });

    if (audioTracks.length === 0) {
      return;
    }

    setTracks((existingTracks) => mergeTracksById(audioTracks, existingTracks));
    setCurrentTrackId(audioTracks[0].id);
  }

  function handleLocalFiles(event: ChangeEvent<HTMLInputElement>) {
    importLocalFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function handleLocalDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    importLocalFiles(Array.from(event.dataTransfer.files));
  }

  async function handleLocalImportClick() {
    const nativePaths = await window.teaMusicBackend?.chooseLocalAudioFiles?.();

    if (!nativePaths) {
      localFileInputRef.current?.click();
      return;
    }

    const localTracks = restorePersistedTrackState(
      nativePaths.map((filePath) => createLocalTrackFromPath(filePath, new Date().toISOString())),
    );

    if (localTracks.length === 0) {
      return;
    }

    setTracks((existingTracks) => mergeTracksById(localTracks, existingTracks));
    setCurrentTrackId(localTracks[0].id);
  }

  // 后端 workerGet 遇到 Cloudflare 挑战时自动弹出验证窗口并等待用户完成验证。
  // 前端只需监听 fangpi:verification-needed 事件来更新提示文案。
  useEffect(() => {
    const cleanup = window.teaMusicBackend?.onVerificationNeeded?.(() => {
      setFinderError('需要真人验证，请在弹出的窗口中点击验证...');
    });
    return cleanup;
  }, []);

  async function runOnlineSearch() {
    const trimmedQuery = finderQuery.trim();
    const backend = window.teaMusicBackend;

    if (!trimmedQuery) {
      return;
    }

    if (!backend?.searchOnline) {
      setFinderError('在线找歌需要在桌面端窗口使用');
      setFinderVerification(null);
      return;
    }

    setFinderLoading(true);
    setFinderError('');
    setFinderVerification(null);

    try {
      const results = await backend.searchOnline(trimmedQuery);

      if (!Array.isArray(results)) {
        if (results?.code === 'VERIFY_REQUIRED' && results.verifyUrl) {
          // workerGet 已自动弹出验证窗口并等待，走到这里说明验证超时
          setFinderError(sourceVerificationBlockedMessage);
          setFinderVerification({ type: 'search', title: trimmedQuery, verifyUrl: results.verifyUrl });
        } else {
          setFinderError(results?.error || '搜索失败，稍后再试');
        }

        return;
      }

      setFinderResults(results);

      // 搜索成功后自动选最佳匹配并下载（全自动，用户只需等验证）
      const bestMatch = chooseBestFinderSong(results, trimmedQuery);

      if (bestMatch) {
        setFinderError(`正在下载 ${bestMatch.title} - ${bestMatch.artist}...`);
        await downloadFromFinder(bestMatch);
        return;
      }

      if (results.length === 0) {
        setFinderError('没找到，换个关键词试试');
      }
    } catch {
      setFinderError('搜索失败，稍后再试');
    } finally {
      setFinderLoading(false);
    }
  }

  async function downloadFromFinder(song: FinderSong) {
    const backend = window.teaMusicBackend;

    if (!backend?.downloadOnline || downloadingIds.has(song.id)) {
      return;
    }

    setDownloadingIds((ids) => new Set(ids).add(song.id));
    setFinderError('');
    setFinderVerification(null);

    try {
      const result = await backend.downloadOnline(song.id);

      if (result && 'filePath' in result) {
        const downloadedTrack = createResolvedTrackFromPath(result.filePath, new Date().toISOString());
        setTracks((existingTracks) => mergeTracksById([downloadedTrack], existingTracks));
        setFinderResults((rows) => rows.filter((row) => row.id !== song.id));
        // 下载成功：自动切歌播放 + 关闭找歌面板
        setCurrentTrackId(downloadedTrack.id);
        setIsPlaying(true);
        setPlaybackTime({ current: 0, duration: downloadedTrack.duration ?? 181 });
        setIsFinderOpen(false);
      } else if (result?.code === 'VERIFY_REQUIRED' && result.verifyUrl) {
        // workerGet 已自动弹出验证窗口并等待，走到这里说明验证超时
        setFinderError(sourceVerificationBlockedMessage);
        setFinderVerification({ type: 'download', songId: song.id, title: song.title, verifyUrl: result.verifyUrl });
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

  function retryAfterVerification() {
    if (!finderVerification) {
      return;
    }

    if (finderVerification.type === 'search') {
      setFinderError('正在重试搜索...');
      void runOnlineSearch();
    } else {
      const retrySong = finderResults.find((row) => row.id === finderVerification.songId);

      if (retrySong) {
        setFinderError('正在重试下载...');
        void downloadFromFinder(retrySong);
      }
    }
  }

  async function togglePlayback() {
    if (!currentTrack?.audioUrl || !audioRef.current) {
      setIsPlaying((playing) => !playing);
      return;
    }

    if (isPlaying) {
      pausePlayback();
      return;
    }

    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }

  function pausePlayback() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  function selectTrack(track: Track, options: { keepPlaying?: boolean } = {}) {
    setCurrentTrackId(track.id);
    setIsPlaying(Boolean(options.keepPlaying));
    setPlaybackTime({ current: 0, duration: track.duration ?? 181 });
    setTracks((existingTracks) =>
      existingTracks.map((existingTrack) =>
        existingTrack.id === track.id ? markTrackPlayed(existingTrack, new Date().toISOString()) : existingTrack,
      ),
    );
  }

  function moveInQueue(direction: 'previous' | 'next', options: { keepPlaying?: boolean } = {}) {
    if (playbackMode === 'repeat-one') {
      return;
    }

    if (playbackMode === 'shuffle' && playbackQueue.length > 1) {
      const candidates = playbackQueue.filter((track) => track.id !== currentTrackId);
      const nextTrack = candidates[Math.floor(Math.random() * candidates.length)];

      if (nextTrack) {
        selectTrack(nextTrack, options);
      }

      return;
    }

    const nextTrackId = getAdjacentTrackId(
      playbackQueue.map((track) => track.id),
      currentTrackId,
      direction,
    );

    if (!nextTrackId) {
      return;
    }

    const nextTrack = tracks.find((track) => track.id === nextTrackId);

    if (nextTrack) {
      selectTrack(nextTrack, options);
    }
  }

  function skipToNextTrack() {
    if (playbackMode === 'repeat-one') {
      moveInQueue('next');
      return;
    }

    setTracks((existingTracks) =>
      existingTracks.map((track) =>
        track.id === currentTrack.id ? markTrackSkipped(track, new Date().toISOString()) : track,
      ),
    );
    moveInQueue('next');
  }

  function handleAudioEnded() {
    if (playbackMode === 'repeat-one') {
      handleSeekChange(0);
      setIsPlaying(true);

      if (currentTrack.audioUrl) {
        const playResult = audioRef.current?.play?.();

        if (playResult && 'catch' in playResult) {
          void playResult.catch(() => undefined);
        }
      }

      return;
    }

    if (playbackQueue.length <= 1) {
      setIsPlaying(false);
      return;
    }

    moveInQueue('next', { keepPlaying: true });
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    setPlaybackTime({
      current: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : playbackTime.duration,
    });
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current;

    if (!audio || !Number.isFinite(audio.duration)) {
      return;
    }

    setPlaybackTime((existingTime) => ({
      current: Math.min(existingTime.current, audio.duration),
      duration: audio.duration,
    }));
  }

  function handleVolumeChange(nextVolume: number) {
    setVolume(nextVolume);

    if (audioRef.current) {
      audioRef.current.volume = nextVolume / 100;
    }
  }

  function adjustVolume(delta: number) {
    handleVolumeChange(Math.min(Math.max(volume + delta, 0), 100));
  }

  function handleSeekChange(nextTime: number) {
    const boundedTime = Math.min(Math.max(nextTime, 0), playbackTime.duration);
    setPlaybackTime((existingTime) => ({ ...existingTime, current: boundedTime }));

    if (audioRef.current) {
      audioRef.current.currentTime = boundedTime;
    }
  }

  function toggleCurrentTrackLike() {
    setTracks((existingTracks) =>
      existingTracks.map((track) => (track.id === currentTrack.id ? { ...track, liked: !track.liked } : track)),
    );
  }

  useEffect(() => {
    function handlePlaybackShortcut(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === 'Escape') {
        if (isLibraryDrawerOpen || isLyricsFullscreenOpen || isTrackMenuOpen || isSearchOpen || isFinderOpen) {
          event.preventDefault();
          setIsLibraryDrawerOpen(false);
          setIsLyricsFullscreenOpen(false);
          setIsTrackMenuOpen(false);
          setIsSearchOpen(false);
          setIsFinderOpen(false);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      if (event.code === 'Space' || event.key === ' ' || event.key === 'MediaPlayPause') {
        event.preventDefault();
        void togglePlayback();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'MediaTrackNext') {
        event.preventDefault();
        skipToNextTrack();
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'MediaTrackPrevious') {
        event.preventDefault();
        moveInQueue('previous');
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        adjustVolume(5);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        adjustVolume(-5);
      }
    }

    window.addEventListener('keydown', handlePlaybackShortcut);
    return () => window.removeEventListener('keydown', handlePlaybackShortcut);
  });

  async function removeCurrentLocalTrack() {
    if (!canRemoveCurrentLocalTrack) {
      return;
    }

    const removedTrack = currentTrack;
    const replacementTrack = tracks.find((track) => track.id !== removedTrack.id);

    if (!replacementTrack) {
      return;
    }

    if (removedTrack.filePath && window.teaMusicBackend?.removeLocalAudioFile) {
      await window.teaMusicBackend.removeLocalAudioFile(removedTrack.filePath);
    }

    setTracks((existingTracks) => existingTracks.filter((track) => track.id !== removedTrack.id));

    if (currentTrackId === removedTrack.id) {
      pausePlayback();
      setCurrentTrackId(replacementTrack.id);
      setPlaybackTime({ current: 0, duration: replacementTrack.duration ?? 181 });
    }
  }

  async function revealCurrentLocalTrack() {
    if (!currentTrack.filePath || !window.teaMusicBackend?.revealLocalAudioFile) {
      return;
    }

    await window.teaMusicBackend.revealLocalAudioFile(currentTrack.filePath);
  }

  function cyclePlaybackMode() {
    setPlaybackMode((mode) => (mode === 'queue' ? 'repeat-one' : mode === 'repeat-one' ? 'shuffle' : 'queue'));
  }

  const currentTrackMenu = isTrackMenuOpen ? (
    <>
      <div
        aria-hidden="true"
        className="menu-scrim"
        onClick={() => {
          setIsTrackMenuOpen(false);
        }}
      />
      <div className="track-menu glass-panel" role="menu" aria-label="播放设置">
        <div className="track-menu-head">
          <span>
            <SlidersHorizontal size={15} />
            播放设置
          </span>
          <small>{currentTrack.title}</small>
        </div>
        <div className="track-menu-actions">
          <button
            className="track-menu-action"
            onClick={() => {
              setIsSearchOpen(true);
              setIsTrackMenuOpen(false);
            }}
          >
            <Search size={16} />
            <span>搜索</span>
          </button>
          <button
            className="track-menu-action"
            onClick={() => {
              void handleLocalImportClick();
              setIsTrackMenuOpen(false);
            }}
          >
            <Upload size={16} />
            <span>导入本地音乐</span>
          </button>
          <button
            className="track-menu-action"
            onClick={() => {
              setIsFinderOpen(true);
              setIsTrackMenuOpen(false);
            }}
          >
            <Download size={16} />
            <span>在线找歌</span>
          </button>
        </div>
        {canRemoveCurrentLocalTrack ? (
          <button
            className="track-menu-wide danger"
            aria-label="移出本地音乐"
            onClick={() => {
              void removeCurrentLocalTrack();
              setIsTrackMenuOpen(false);
            }}
          >
            <Trash2 size={16} />
            <span>移出本地音乐</span>
          </button>
        ) : null}
        {canRevealCurrentLocalTrack ? (
          <button
            className="track-menu-wide"
            aria-label="在访达中显示"
            onClick={() => {
              void revealCurrentLocalTrack();
              setIsTrackMenuOpen(false);
            }}
          >
            <FolderOpen size={16} />
            <span>在访达中显示</span>
          </button>
        ) : null}
        <div className="menu-volume-panel">
          <div className="menu-volume-head">
            <button type="button" aria-label="音量" className="menu-volume-label">
              <Volume2 size={16} />
              音量
            </button>
            <strong>{volume}</strong>
          </div>
          <input
            aria-label="音量大小"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => handleVolumeChange(Number(event.target.value))}
          />
        </div>
      </div>
    </>
  ) : null;

  return (
    <div
      className={isDragActive ? 'app-shell dragging-local' : 'app-shell'}
      style={shellStyle}
      onDragLeave={() => setIsDragActive(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDrop={handleLocalDrop}
    >
      <div aria-hidden="true" className="app-backdrop" />
      {isDragActive ? <div className="drop-hint">松开导入到本地音乐</div> : null}
      <input
        ref={localFileInputRef}
        aria-label="添加本地音乐"
        className="visually-hidden"
        type="file"
        accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.aif,.aiff,.alac"
        multiple
        onChange={handleLocalFiles}
      />

      {!isSearchOpen ? <div aria-hidden="true" className="drag-strip" /> : null}

      {isSearchOpen ? (
        <div className="search-bar">
          <Search size={15} />
          <input
            ref={searchInputRef}
            autoFocus
            placeholder="搜索歌曲、歌手"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                setIsSearchOpen(false);
              }
            }}
          />
          <button aria-label="关闭搜索" onClick={() => { setQuery(''); setIsSearchOpen(false); }}>
            <X size={14} />
          </button>
        </div>
      ) : null}

      <main className="content">
        <ImmersivePlayer
          currentTrack={currentTrack}
          currentTime={playbackTime.current}
          duration={playbackTime.duration}
          isPlaying={isPlaying}
          playbackMode={playbackMode}
          onTogglePlayback={() => void togglePlayback()}
          onPrevious={() => moveInQueue('previous')}
          onNext={skipToNextTrack}
          onCyclePlaybackMode={cyclePlaybackMode}
          onSeek={handleSeekChange}
          onToggleLike={toggleCurrentTrackLike}
          onOpenLibrary={() => setIsLibraryDrawerOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenLyrics={() => setIsLyricsFullscreenOpen(true)}
          onToggleMenu={() => setIsTrackMenuOpen((open) => !open)}
          isMenuOpen={isTrackMenuOpen}
          menu={currentTrackMenu}
        />
      </main>

      {isLibraryDrawerOpen ? (
        <LibraryDrawer
          tracks={filteredTracks}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          query={query}
          onQueryChange={setQuery}
          onClose={() => setIsLibraryDrawerOpen(false)}
          onOpenFinder={() => {
            setIsLibraryDrawerOpen(false);
            setIsFinderOpen(true);
          }}
          onSelectTrack={selectTrack}
        />
      ) : null}

      <audio
        ref={audioRef}
        src={currentTrack.audioUrl}
        onEnded={handleAudioEnded}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
      />
      {isLyricsFullscreenOpen ? (
        <div className="lyrics-fullscreen" role="dialog" aria-label="全屏歌词">
          <button aria-label="关闭全屏歌词" className="lyrics-close" onClick={() => setIsLyricsFullscreenOpen(false)}>
            <X size={18} />
          </button>
          <LyricStage
            currentTime={playbackTime.current}
            duration={playbackTime.duration}
            lyrics={currentTrack.lyrics ?? []}
            mode="fullscreen"
            onLineClick={handleSeekChange}
          />
        </div>
      ) : null}

      {isFinderOpen ? (
        <div className="finder-overlay" role="dialog" aria-label="在线找歌" onClick={() => setIsFinderOpen(false)}>
          <div className="finder-panel glass-panel" onClick={(event) => event.stopPropagation()}>
            <div className="finder-head">
              <span>在线找歌</span>
              <button aria-label="关闭在线找歌" onClick={() => setIsFinderOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <label className="finder-search">
              <Search size={15} />
              <input
                autoFocus
                placeholder="歌名或歌手，回车搜索"
                value={finderQuery}
                onChange={(event) => setFinderQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void runOnlineSearch();
                  }
                  if (event.key === 'Escape') {
                    setIsFinderOpen(false);
                  }
                }}
              />
            </label>
            {finderError ? <p className="finder-hint">{finderError}</p> : null}
            {finderVerification ? (
              <div className="finder-verification">
                <button
                  type="button"
                  onClick={() => retryAfterVerification()}
                >
                  重试
                </button>
              </div>
            ) : null}
            <div className="finder-source-note" aria-label="素材来源说明">
              <span>封面：同名图片、cover 或 folder</span>
              <span>歌词：同名 .lrc</span>
              <span>下载：保存到音乐/TeaMusic/Archive 并按歌手归档</span>
            </div>
            <ul className="finder-list">
              {finderResults.map((song) => (
                <li key={song.id}>
                  <div className="finder-meta">
                    <span className="finder-title">{song.title}</span>
                    <span className="finder-artist">{song.artist}</span>
                  </div>
                  {downloadingIds.has(song.id) ? (
                    <span aria-label="下载中" className="finder-dl downloading">
                      <Download size={16} />
                    </span>
                  ) : (
                    <button className="finder-dl" aria-label="下载" onClick={() => void downloadFromFinder(song)}>
                      <Download size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {finderLoading ? <p className="finder-hint">搜索中...</p> : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}
