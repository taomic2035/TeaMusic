import { Music2, Search, X } from 'lucide-react';
import { Track } from '../domain/music';

interface LibraryDrawerProps {
  tracks: Track[];
  currentTrackId: string;
  isPlaying: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onOpenFinder: () => void;
  onSelectTrack: (track: Track, options?: { keepPlaying?: boolean }) => void;
}

function getTrackSubtitle(track: Track): string {
  return track.album ? `${track.artist} · ${track.album}` : track.artist;
}

export function LibraryDrawer({
  tracks,
  currentTrackId,
  isPlaying,
  query,
  onQueryChange,
  onClose,
  onOpenFinder,
  onSelectTrack,
}: LibraryDrawerProps) {
  return (
    <div className="library-drawer-shell">
      <div className="library-drawer-scrim" aria-hidden="true" onClick={onClose} />
      <section className="library-drawer glass-panel" role="dialog" aria-label="歌曲列表">
        <header className="library-drawer-head">
          <strong>歌曲列表</strong>
          <div className="library-drawer-actions">
            <button className="finder-shortcut" onClick={onOpenFinder}>
              在线找歌
            </button>
            <button aria-label="关闭歌曲列表" onClick={onClose}>
              <X size={17} />
            </button>
          </div>
        </header>

        <label className="drawer-search">
          <Search size={15} />
          <input
            autoFocus
            placeholder="搜索歌曲、歌手"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        <div className="track-list drawer-list">
          {tracks.length === 0 ? (
            <div className="empty-state drawer-empty">
              <Music2 size={18} />
              <span>{query.trim() ? '没有匹配的歌曲' : '还没有歌曲'}</span>
            </div>
          ) : null}
          {tracks.map((track) => {
            return (
              <button
                className={track.id === currentTrackId ? 'track-row active' : 'track-row'}
                key={track.id}
                onClick={() => {
                  onSelectTrack(track);
                  onClose();
                }}
                onDoubleClick={() => {
                  onSelectTrack(track, { keepPlaying: true });
                  onClose();
                }}
              >
                {track.id === currentTrackId && isPlaying ? (
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
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
