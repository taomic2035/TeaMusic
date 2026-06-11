import { Search, X } from 'lucide-react';
import { Track, getTrackBadge } from '../domain/music';

interface LibraryDrawerProps {
  tracks: Track[];
  currentTrackId: string;
  isPlaying: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
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
  onSelectTrack,
}: LibraryDrawerProps) {
  return (
    <div className="library-drawer-shell">
      <div className="library-drawer-scrim" aria-hidden="true" onClick={onClose} />
      <section className="library-drawer glass-panel" role="dialog" aria-label="歌曲列表">
        <header className="library-drawer-head">
          <strong>歌曲列表</strong>
          <button aria-label="关闭歌曲列表" onClick={onClose}>
            <X size={17} />
          </button>
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
          {tracks.map((track) => {
            const badge = getTrackBadge(track);

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
                {badge ? <em>{badge}</em> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
