import {
  Heart,
  ListMusic,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { ReactNode } from 'react';
import { Track, formatPlaybackTime, getTrackBadge } from '../domain/music';
import { LyricStage } from './LyricStage';

type PlaybackMode = 'queue' | 'repeat-one' | 'shuffle';

interface ImmersivePlayerProps {
  currentTrack: Track;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackMode: PlaybackMode;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCyclePlaybackMode: () => void;
  onSeek: (time: number) => void;
  onToggleLike: () => void;
  onOpenLibrary: () => void;
  onOpenSearch: () => void;
  onOpenLyrics: () => void;
  onToggleMenu: () => void;
  isMenuOpen: boolean;
  menu: ReactNode;
}

const playbackModeCopy: Record<PlaybackMode, string> = {
  queue: '顺序播放',
  'repeat-one': '单曲循环',
  shuffle: '随机播放',
};

function getTrackSubtitle(track: Track): string {
  return track.album ? `${track.artist} · ${track.album}` : track.artist;
}

export function ImmersivePlayer({
  currentTrack,
  currentTime,
  duration,
  isPlaying,
  playbackMode,
  onTogglePlayback,
  onPrevious,
  onNext,
  onCyclePlaybackMode,
  onSeek,
  onToggleLike,
  onOpenLibrary,
  onOpenSearch,
  onOpenLyrics,
  onToggleMenu,
  isMenuOpen,
  menu,
}: ImmersivePlayerProps) {
  const ModeIcon = playbackMode === 'queue' ? Repeat : playbackMode === 'repeat-one' ? Repeat1 : Shuffle;
  const badge = getTrackBadge(currentTrack);

  return (
    <section className="immersive-player" aria-label="沉浸播放页">
      <div className="immersive-top">
        <button aria-label="打开歌曲列表" onClick={onOpenLibrary}>
          <ListMusic size={18} />
        </button>
        <span>TeaMusic</span>
        <button aria-label="搜索" onClick={onOpenSearch}>
          <Search size={18} />
        </button>
      </div>

      <div className="immersive-cover-wrap">
        {currentTrack.coverUrl ? (
          <img className="immersive-cover" src={currentTrack.coverUrl} alt="" />
        ) : (
          <div className="immersive-cover fallback" aria-hidden="true" />
        )}
      </div>

      <div className="immersive-meta" aria-label="当前播放">
        <h2>{currentTrack.title}</h2>
        <span>{getTrackSubtitle(currentTrack)}</span>
        {badge ? <em>{badge}</em> : null}
      </div>

      <LyricStage
        currentTime={currentTime}
        duration={duration}
        lyrics={currentTrack.lyrics ?? []}
        mode="compact"
        onOpenFullscreen={onOpenLyrics}
      />

      <div className="immersive-progress">
        <span>{formatPlaybackTime(currentTime)}</span>
        <input
          aria-label="播放进度"
          className="progress-slider"
          max={duration}
          min="0"
          type="range"
          value={Math.floor(currentTime)}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
        <span>{formatPlaybackTime(duration)}</span>
      </div>

      <div className="immersive-controls">
        <button
          aria-label={`播放模式：${playbackModeCopy[playbackMode]}`}
          className={playbackMode === 'queue' ? '' : 'mode-active'}
          onClick={onCyclePlaybackMode}
        >
          <ModeIcon size={19} />
        </button>
        <button aria-label="上一首" onClick={onPrevious}>
          <SkipBack size={21} fill="currentColor" />
        </button>
        <button className="play-button" aria-label={isPlaying ? '暂停' : '播放'} onClick={onTogglePlayback}>
          {isPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
        </button>
        <button aria-label="下一首" onClick={onNext}>
          <SkipForward size={21} fill="currentColor" />
        </button>
        <button aria-label={currentTrack.liked ? '取消喜欢当前歌曲' : '喜欢当前歌曲'} onClick={onToggleLike}>
          <Heart size={20} fill={currentTrack.liked ? 'currentColor' : 'none'} />
        </button>
        <button aria-label="更多操作" className={isMenuOpen ? 'active' : ''} onClick={onToggleMenu}>
          <MoreHorizontal size={20} />
        </button>
      </div>

      {menu}
    </section>
  );
}
