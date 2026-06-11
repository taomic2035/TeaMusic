import { CSSProperties, MouseEvent } from 'react';
import {
  getActiveCharacterCount,
  getActiveLyricIndex,
  getLyricLineProgress,
  splitLyricCharacters,
} from '../domain/lyrics';
import { LyricLine } from '../domain/music';

interface LyricStageProps {
  currentTime: number;
  duration: number;
  lyrics: LyricLine[];
  mode: 'compact' | 'fullscreen';
  onLineClick?: (time: number) => void;
  onOpenFullscreen?: () => void;
}

export function LyricStage({
  currentTime,
  duration,
  lyrics,
  mode,
  onLineClick,
  onOpenFullscreen,
}: LyricStageProps) {
  const activeIndex = getActiveLyricIndex(lyrics, currentTime);
  const activeProgress = getLyricLineProgress(lyrics, activeIndex, currentTime, duration);
  const visibleLyrics =
    mode === 'compact'
      ? lyrics.slice(Math.max(activeIndex - 1, 0), Math.min(activeIndex + 3, lyrics.length))
      : lyrics;

  if (lyrics.length === 0) {
    return (
      <button className={`lyric-stage ${mode}`} aria-label="歌词预览" type="button" onClick={onOpenFullscreen}>
        <span className="lyric-empty">暂无歌词，继续听歌</span>
      </button>
    );
  }

  function handleLineClick(event: MouseEvent<HTMLSpanElement>, line: LyricLine) {
    if (mode !== 'fullscreen') {
      return;
    }

    event.stopPropagation();
    onLineClick?.(line.at);
  }

  return (
    <button
      className={`lyric-stage ${mode}`}
      aria-label={mode === 'compact' ? '歌词预览' : '全屏歌词列表'}
      type="button"
      onClick={mode === 'compact' ? onOpenFullscreen : undefined}
    >
      {visibleLyrics.map((line) => {
        const originalIndex = lyrics.indexOf(line);
        const isActive = originalIndex === activeIndex;
        const activeCharacterCount = isActive ? getActiveCharacterCount(line.text, activeProgress) : 0;

        return (
          <span
            className={isActive ? 'lyric-line active' : 'lyric-line'}
            key={`${line.at}:${line.text}`}
            style={isActive ? ({ '--lyric-progress': activeProgress } as CSSProperties) : undefined}
            onClick={(event) => handleLineClick(event, line)}
          >
            {splitLyricCharacters(line.text).map((character, index) => (
              <span className={index < activeCharacterCount ? 'char active' : 'char'} key={`${character}:${index}`}>
                {character}
              </span>
            ))}
          </span>
        );
      })}
    </button>
  );
}
