import {
  Download,
  Heart,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ChangeEvent, CSSProperties, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { LyricStage } from './components/LyricStage';
import {
  Track,
  createLocalTrackFromFile,
  createLocalTrackFromPath,
  createResolvedTrackFromPath,
  filterTracks,
  formatPlaybackTime,
  getAdjacentTrackId,
  getTrackBadge,
  markTrackPlayed,
  markTrackSkipped,
} from './domain/music';

type PlaybackMode = 'queue' | 'repeat-one' | 'shuffle';

const playbackModeCopy: Record<PlaybackMode, string> = {
  queue: '顺序播放',
  'repeat-one': '单曲循环',
  shuffle: '随机播放',
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

function getTrackSubtitle(track: Track): string {
  return track.album ? `${track.artist} · ${track.album}` : track.artist;
}

export function App() {
  const [tracks, setTracks] = useState(() => restorePersistedTrackState(initialTracks));
  const [query, setQuery] = useState('');
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  const [finderQuery, setFinderQuery] = useState('');
  const [finderResults, setFinderResults] = useState<Array<{ id: string; title: string; artist: string }>>([]);
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderError, setFinderError] = useState('');
  const [currentTrackId, setCurrentTrackId] = useState(() => restoreCurrentTrackId(initialTracks));
  const [hasCompletedLibraryRestore, setHasCompletedLibraryRestore] = useState(
    () => typeof window === 'undefined' || !window.teaMusicBackend,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTrackMenuOpen, setIsTrackMenuOpen] = useState(false);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isLyricsFullscreenOpen, setIsLyricsFullscreenOpen] = useState(false);
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

  async function runOnlineSearch() {
    const trimmedQuery = finderQuery.trim();
    const backend = window.teaMusicBackend;

    if (!trimmedQuery || !backend?.searchOnline) {
      return;
    }

    setFinderLoading(true);
    setFinderError('');

    try {
      const results = await backend.searchOnline(trimmedQuery);
      setFinderResults(results);

      if (results.length === 0) {
        setFinderError('没找到，换个关键词试试');
      }
    } catch {
      setFinderError('搜索失败，稍后再试');
    } finally {
      setFinderLoading(false);
    }
  }

  async function downloadFromFinder(song: { id: string; title: string; artist: string }) {
    const backend = window.teaMusicBackend;

    if (!backend?.downloadOnline || downloadingIds.has(song.id)) {
      return;
    }

    setDownloadingIds((ids) => new Set(ids).add(song.id));
    setFinderError('');

    try {
      const result = await backend.downloadOnline(song.id);

      if (result && 'filePath' in result) {
        const downloadedTrack = createResolvedTrackFromPath(result.filePath, new Date().toISOString());
        setTracks((existingTracks) => mergeTracksById([downloadedTrack], existingTracks));
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
        if (isLyricsFullscreenOpen || isTrackMenuOpen || isVolumeOpen || isSearchOpen || isFinderOpen) {
          event.preventDefault();
          setIsLyricsFullscreenOpen(false);
          setIsTrackMenuOpen(false);
          setIsVolumeOpen(false);
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

  const ModeIcon = playbackMode === 'queue' ? Repeat : playbackMode === 'repeat-one' ? Repeat1 : Shuffle;

  return (
    <div
      className={isDragActive ? 'app-shell dragging-local' : 'app-shell'}
      style={currentTrack.coverUrl ? ({ '--app-cover': `url("${currentTrack.coverUrl}")` } as CSSProperties) : undefined}
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
        <div className="track-list" aria-label="歌曲列表">
          {filteredTracks.map((track) => {
            const badge = getTrackBadge(track);

            return (
              <button
                className={track.id === currentTrack?.id ? 'track-row active' : 'track-row'}
                key={track.id}
                onClick={() => selectTrack(track)}
                onDoubleClick={() => selectTrack(track, { keepPlaying: true })}
              >
                {track.id === currentTrack?.id && isPlaying ? (
                  <span aria-hidden="true" className="playing-bars">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <span aria-hidden="true" className="track-bullet" />
                )}
                <div>
                  <strong>{track.title}</strong>
                  <span>{getTrackSubtitle(track)}</span>
                </div>
                {badge ? <em>{badge}</em> : null}
              </button>
            );
          })}
          {filteredTracks.length === 0 ? (
            <div className="empty-state">
              <Music2 size={18} />
              <span>{query.trim() ? '没有匹配的歌曲' : '还没有歌曲'}</span>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="player-bar glass-panel">
        <section className="now-playing" aria-label="当前播放">
          <div className="now-playing-meta">
            <h2>{currentTrack.title}</h2>
            <span>
              {getTrackSubtitle(currentTrack)}
              {getTrackBadge(currentTrack) ? ` · ${getTrackBadge(currentTrack)}` : ''}
            </span>
          </div>
          <button
            aria-label={currentTrack.liked ? '取消喜欢当前歌曲' : '喜欢当前歌曲'}
            className={currentTrack.liked ? 'mini-like active' : 'mini-like'}
            onClick={toggleCurrentTrackLike}
          >
            <Heart size={18} fill={currentTrack.liked ? 'currentColor' : 'none'} />
          </button>
        </section>

        <LyricStage
          currentTime={playbackTime.current}
          duration={playbackTime.duration}
          lyrics={currentTrack.lyrics ?? []}
          mode="compact"
          onOpenFullscreen={() => setIsLyricsFullscreenOpen(true)}
        />

        <div className="progress-area">
          <span>{formatPlaybackTime(playbackTime.current)}</span>
          <input
            aria-label="播放进度"
            className="progress-slider"
            max={playbackTime.duration}
            min="0"
            type="range"
            value={Math.floor(playbackTime.current)}
            onChange={(event) => handleSeekChange(Number(event.target.value))}
          />
          <span>{formatPlaybackTime(playbackTime.duration)}</span>
        </div>

        <div className="transport">
          <button
            aria-label={`播放模式：${playbackModeCopy[playbackMode]}`}
            className={playbackMode === 'queue' ? '' : 'mode-active'}
            onClick={cyclePlaybackMode}
          >
            <ModeIcon size={18} />
          </button>
          <button aria-label="上一首" onClick={() => moveInQueue('previous')}>
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button className="play-button" aria-label={isPlaying ? '暂停' : '播放'} onClick={togglePlayback}>
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button aria-label="下一首" onClick={skipToNextTrack}>
            <SkipForward size={18} fill="currentColor" />
          </button>

          <div className="volume-control">
            <button
              aria-label="音量"
              className={isVolumeOpen ? 'volume-btn active' : 'volume-btn'}
              onClick={() => setIsVolumeOpen((open) => !open)}
            >
              {volume > 0 ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            {isVolumeOpen ? (
              <>
                <div aria-hidden="true" className="menu-scrim" onClick={() => setIsVolumeOpen(false)} />
                <div className="volume-pop glass-panel">
                  <input
                    aria-label="音量大小"
                    className="volume-vertical"
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(event) => handleVolumeChange(Number(event.target.value))}
                  />
                </div>
              </>
            ) : null}
          </div>

          <button
            aria-label="更多操作"
            className={isTrackMenuOpen ? 'track-menu-btn active' : 'track-menu-btn'}
            onClick={() => setIsTrackMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={18} />
          </button>
          {isTrackMenuOpen ? (
            <>
              <div aria-hidden="true" className="menu-scrim" onClick={() => setIsTrackMenuOpen(false)} />
              <div className="track-menu glass-panel" role="menu">
                <button onClick={() => { setIsSearchOpen(true); setIsTrackMenuOpen(false); }}>搜索</button>
                <button onClick={() => { void handleLocalImportClick(); setIsTrackMenuOpen(false); }}>导入本地音乐</button>
                <button onClick={() => { setIsFinderOpen(true); setIsTrackMenuOpen(false); }}>在线找歌</button>
                {canRemoveCurrentLocalTrack ? (
                  <button aria-label="移出本地音乐" onClick={() => { void removeCurrentLocalTrack(); setIsTrackMenuOpen(false); }}>移出本地音乐</button>
                ) : null}
                {canRevealCurrentLocalTrack ? (
                  <button aria-label="在访达中显示" onClick={() => { void revealCurrentLocalTrack(); setIsTrackMenuOpen(false); }}>在访达中显示</button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <audio
          ref={audioRef}
          src={currentTrack.audioUrl}
          onEnded={handleAudioEnded}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
        />
      </footer>

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
            {finderLoading ? <p className="finder-hint">搜索中…</p> : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}
