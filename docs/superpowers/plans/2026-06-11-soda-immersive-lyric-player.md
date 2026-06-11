# Soda Immersive Lyric Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn TeaMusic from a list-first vertical player into a Soda Music-inspired immersive now-playing window with cover-driven colors, lyric scrolling, word-by-word highlighting, a lyric fullscreen mode, and a drawer-based library.

**Architecture:** Keep playback state and Electron integration in `src/App.tsx`, but move lyric timing math into `src/domain/lyrics.ts` and cover color extraction into `src/hooks/useDominantTheme.ts`. Add focused UI components for the immersive player, lyric stage, and library drawer so the current oversized app component does not absorb all rendering logic.

**Tech Stack:** React 19, TypeScript, Vite, Electron preload APIs, Vitest, Testing Library, CSS custom properties, canvas image sampling with fallback theme variables.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/domain/lyrics.ts` | Pure lyric timing helpers: active line lookup, next line boundary, normalized line progress, character splitting, active character count. |
| `src/domain/lyrics.test.ts` | Unit coverage for line lookup, progress bounds, final-line duration fallback, and Chinese character splitting. |
| `src/hooks/useDominantTheme.ts` | Best-effort cover image sampling and CSS variable output with deterministic fallback colors. |
| `src/hooks/useDominantTheme.test.tsx` | Hook tests for fallback theme and failure-tolerant image handling. |
| `src/components/LyricStage.tsx` | Reusable lyric renderer for compact and fullscreen modes. Handles active line, char spans, shine progress, and lyric-line click callbacks. |
| `src/components/ImmersivePlayer.tsx` | Main now-playing screen: top actions, cover, metadata, compact lyric stage, progress, transport controls, and current-track menu slots. |
| `src/components/LibraryDrawer.tsx` | Drawer-based unified library list, search input, rows, empty state, and close behavior. |
| `src/App.tsx` | State orchestration: playback, current track, lyrics loading, theme variables, drawer/fullscreen toggles, existing Electron/backend flows. |
| `src/styles/global.css` | New immersive layout, cover-driven theme variables, lyric/fullscreen/drawer styles, responsive 420x820 and 360x620 behavior. |
| `src/App.test.tsx` | Integration tests for default immersive screen, lyrics fullscreen, drawer selection, local LRC restore, theme variables, and existing playback controls. |
| `README.md` | Product copy update: immersive lyric player instead of no-lyrics minimal list player. |

---

## Task 1: Add Lyric Timing Domain Helpers

**Files:**
- Create: `src/domain/lyrics.ts`
- Create: `src/domain/lyrics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/lyrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  getActiveLyricIndex,
  getLyricLineProgress,
  getNextLyricTime,
  getActiveCharacterCount,
  splitLyricCharacters,
} from './lyrics';
import { LyricLine } from './music';

const lyrics: LyricLine[] = [
  { at: 0, text: '把今天调成慢速播放' },
  { at: 12, text: '让玻璃里的光轻轻晃' },
  { at: 25, text: '感谢你爱我' },
];

describe('lyric timing helpers', () => {
  it('finds the active lyric line at time boundaries', () => {
    expect(getActiveLyricIndex(lyrics, -1)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 0)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 11.99)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 12)).toBe(1);
    expect(getActiveLyricIndex(lyrics, 99)).toBe(2);
  });

  it('uses the next lyric time or duration as the line end', () => {
    expect(getNextLyricTime(lyrics, 0, 181)).toBe(12);
    expect(getNextLyricTime(lyrics, 2, 181)).toBe(181);
    expect(getNextLyricTime(lyrics, 2, 20)).toBe(26);
  });

  it('normalizes line progress between zero and one', () => {
    expect(getLyricLineProgress(lyrics, 1, 10, 181)).toBe(0);
    expect(getLyricLineProgress(lyrics, 1, 18.5, 181)).toBeCloseTo(0.5);
    expect(getLyricLineProgress(lyrics, 1, 90, 181)).toBe(1);
  });

  it('splits Chinese lyrics by visible character', () => {
    expect(splitLyricCharacters('让玻璃里的光')).toEqual(['让', '玻', '璃', '里', '的', '光']);
  });

  it('maps line progress to active character count', () => {
    expect(getActiveCharacterCount('感谢你爱我', 0)).toBe(0);
    expect(getActiveCharacterCount('感谢你爱我', 0.5)).toBe(3);
    expect(getActiveCharacterCount('感谢你爱我', 1)).toBe(5);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx vitest run src/domain/lyrics.test.ts
```

Expected: FAIL because `src/domain/lyrics.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/domain/lyrics.ts`:

```ts
import { LyricLine } from './music';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

export function getActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0) {
    return -1;
  }

  if (currentTime <= lyrics[0].at) {
    return 0;
  }

  for (let index = lyrics.length - 1; index >= 0; index -= 1) {
    if (currentTime >= lyrics[index].at) {
      return index;
    }
  }

  return 0;
}

export function getNextLyricTime(lyrics: LyricLine[], activeIndex: number, duration: number): number {
  const activeLine = lyrics[activeIndex];
  const nextLine = lyrics[activeIndex + 1];

  if (!activeLine) {
    return Number.isFinite(duration) && duration > 0 ? duration : 1;
  }

  if (nextLine && nextLine.at > activeLine.at) {
    return nextLine.at;
  }

  if (Number.isFinite(duration) && duration > activeLine.at) {
    return duration;
  }

  return activeLine.at + 1;
}

export function getLyricLineProgress(
  lyrics: LyricLine[],
  activeIndex: number,
  currentTime: number,
  duration: number,
): number {
  const activeLine = lyrics[activeIndex];

  if (!activeLine) {
    return 0;
  }

  const nextTime = getNextLyricTime(lyrics, activeIndex, duration);
  return clamp01((currentTime - activeLine.at) / Math.max(nextTime - activeLine.at, 0.001));
}

export function splitLyricCharacters(text: string): string[] {
  return Array.from(text);
}

export function getActiveCharacterCount(text: string, progress: number): number {
  return Math.round(splitLyricCharacters(text).length * clamp01(progress));
}
```

- [ ] **Step 4: Verify the unit tests pass**

Run:

```bash
npx vitest run src/domain/lyrics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/domain/lyrics.ts src/domain/lyrics.test.ts
git commit -m "feat: add lyric timing helpers"
```

---

## Task 2: Add Cover Theme Extraction Hook

**Files:**
- Create: `src/hooks/useDominantTheme.ts`
- Create: `src/hooks/useDominantTheme.test.tsx`

- [ ] **Step 1: Write fallback-first hook tests**

Create `src/hooks/useDominantTheme.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDominantTheme } from './useDominantTheme';

describe('useDominantTheme', () => {
  it('returns deterministic fallback variables when no cover exists', () => {
    const { result } = renderHook(() => useDominantTheme(undefined));

    expect(result.current['--theme-accent']).toBe('#7bffb4');
    expect(result.current['--theme-accent-soft']).toBe('rgba(123, 255, 180, 0.18)');
    expect(result.current['--theme-surface']).toBe('rgba(10, 12, 16, 0.54)');
  });

  it('keeps fallback variables when image sampling cannot complete', async () => {
    const { result } = renderHook(() => useDominantTheme('file:///missing-cover.jpg'));

    await waitFor(() => {
      expect(result.current['--theme-accent']).toBe('#7bffb4');
    });
  });
});
```

- [ ] **Step 2: Run the failing hook tests**

Run:

```bash
npx vitest run src/hooks/useDominantTheme.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook with fallback-safe sampling**

Create `src/hooks/useDominantTheme.ts`:

```ts
import { CSSProperties, useEffect, useState } from 'react';

export type ThemeVariables = CSSProperties & {
  '--theme-accent': string;
  '--theme-accent-soft': string;
  '--theme-surface': string;
  '--theme-text-strong': string;
};

const fallbackTheme: ThemeVariables = {
  '--theme-accent': '#7bffb4',
  '--theme-accent-soft': 'rgba(123, 255, 180, 0.18)',
  '--theme-surface': 'rgba(10, 12, 16, 0.54)',
  '--theme-text-strong': 'rgba(255, 255, 255, 0.94)',
};

function toThemeFromRgb(red: number, green: number, blue: number): ThemeVariables {
  const accent = `rgb(${red}, ${green}, ${blue})`;
  return {
    '--theme-accent': accent,
    '--theme-accent-soft': `rgba(${red}, ${green}, ${blue}, 0.2)`,
    '--theme-surface': `rgba(${Math.max(red - 72, 8)}, ${Math.max(green - 72, 8)}, ${Math.max(blue - 72, 8)}, 0.58)`,
    '--theme-text-strong': 'rgba(255, 255, 255, 0.94)',
  };
}

export function useDominantTheme(coverUrl?: string): ThemeVariables {
  const [theme, setTheme] = useState<ThemeVariables>(fallbackTheme);

  useEffect(() => {
    if (!coverUrl || typeof Image === 'undefined' || typeof document === 'undefined') {
      setTheme(fallbackTheme);
      return;
    }

    let isMounted = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (!context) {
          return;
        }

        canvas.width = 1;
        canvas.height = 1;
        context.drawImage(image, 0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;

        if (isMounted) {
          setTheme(toThemeFromRgb(red, green, blue));
        }
      } catch {
        if (isMounted) {
          setTheme(fallbackTheme);
        }
      }
    };

    image.onerror = () => {
      if (isMounted) {
        setTheme(fallbackTheme);
      }
    };

    image.src = coverUrl;

    return () => {
      isMounted = false;
    };
  }, [coverUrl]);

  return theme;
}
```

- [ ] **Step 4: Verify hook tests pass**

Run:

```bash
npx vitest run src/hooks/useDominantTheme.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/hooks/useDominantTheme.ts src/hooks/useDominantTheme.test.tsx
git commit -m "feat: derive theme variables from cover art"
```

---

## Task 3: Build the Reusable Lyric Stage

**Files:**
- Create: `src/components/LyricStage.tsx`
- Test: `src/App.test.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add component-level integration expectations to `src/App.test.tsx`**

Append these tests inside `describe('App shell', () => { ... })`:

```tsx
it('renders compact synced lyrics on the immersive player screen', () => {
  render(<App />);

  expect(screen.getByLabelText('歌词预览')).toBeInTheDocument();
  expect(screen.getByText('让玻璃里的光轻轻晃')).toBeInTheDocument();
  expect(document.querySelector('.lyric-line.active')).toBeInTheDocument();
});

it('opens fullscreen lyrics from the compact lyric stage', () => {
  render(<App />);

  fireEvent.click(screen.getByLabelText('歌词预览'));

  expect(screen.getByRole('dialog', { name: '全屏歌词' })).toBeInTheDocument();
  expect(screen.getByLabelText('关闭全屏歌词')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
npx vitest run src/App.test.tsx -t "lyrics"
```

Expected: FAIL because there is no lyric stage in the current UI.

- [ ] **Step 3: Implement `LyricStage`**

Create `src/components/LyricStage.tsx`:

```tsx
import { LyricLine } from '../domain/music';
import {
  getActiveCharacterCount,
  getActiveLyricIndex,
  getLyricLineProgress,
  splitLyricCharacters,
} from '../domain/lyrics';

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
            style={isActive ? ({ '--lyric-progress': activeProgress } as React.CSSProperties) : undefined}
            onClick={(event) => {
              if (mode === 'fullscreen') {
                event.stopPropagation();
                onLineClick?.(line.at);
              }
            }}
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
```

- [ ] **Step 4: Add lyric styles**

Append to `src/styles/global.css`:

```css
.lyric-stage {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: center;
  cursor: pointer;
  mask-image: linear-gradient(transparent, #000 18%, #000 82%, transparent);
}

.lyric-stage.fullscreen {
  gap: 18px;
  overflow-y: auto;
  padding: 28px 26px 120px;
  text-align: left;
  mask-image: linear-gradient(transparent, #000 8%, #000 92%, transparent);
}

.lyric-line {
  position: relative;
  display: block;
  color: rgba(255, 255, 255, 0.38);
  font-size: 15px;
  line-height: 1.55;
  transition: color 0.25s ease, font-size 0.25s ease, transform 0.25s ease;
}

.lyric-line.active {
  color: rgba(255, 255, 255, 0.96);
  font-size: 22px;
  font-weight: 760;
  text-shadow: 0 0 28px color-mix(in srgb, var(--theme-accent) 44%, transparent);
}

.lyric-line.active::after {
  position: absolute;
  inset: -5px -18px;
  pointer-events: none;
  content: "";
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.32), transparent);
  filter: blur(10px);
  opacity: 0.78;
  transform: translateX(calc((var(--lyric-progress, 0) * 100%) - 50%));
}

.char.active {
  color: var(--theme-text-strong);
}

.lyric-empty {
  color: rgba(255, 255, 255, 0.48);
  font-size: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .lyric-line,
  .lyric-line.active::after {
    transition: none;
  }

  .lyric-line.active::after {
    display: none;
  }
}
```

- [ ] **Step 5: Wire temporarily into `App.tsx` enough for tests**

Import:

```tsx
import { LyricStage } from './components/LyricStage';
```

Add fullscreen state near other UI state:

```tsx
const [isLyricsFullscreenOpen, setIsLyricsFullscreenOpen] = useState(false);
```

Render compact lyrics in the current player area after `.now-playing` and before `.progress-area`:

```tsx
<LyricStage
  currentTime={playbackTime.current}
  duration={playbackTime.duration}
  lyrics={currentTrack.lyrics ?? []}
  mode="compact"
  onOpenFullscreen={() => setIsLyricsFullscreenOpen(true)}
/>
```

Render fullscreen overlay before the closing app shell:

```tsx
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
```

- [ ] **Step 6: Verify lyric tests pass**

Run:

```bash
npx vitest run src/App.test.tsx -t "lyrics"
```

Expected: PASS after accessible labels are present.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/LyricStage.tsx src/App.tsx src/App.test.tsx src/styles/global.css
git commit -m "feat: add synchronized lyric stage"
```

---

## Task 4: Restore Local LRC Loading in the UI

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Add a failing local LRC restore test**

Append to `src/App.test.tsx`:

```tsx
it('loads sidecar lyrics for restored local music', async () => {
  const filePath = '/Users/taomic/Music/TeaMusic/Local/玻璃夜航-Taomic.wav';
  const readLocalLyrics = vi.fn(async () => '[00:01.00]把歌词放回播放器\n[00:05.00]让光从歌词上划过');
  window.teaMusicBackend = {
    scanResolvedLibrary: async () => [],
    scanLocalLibrary: async () => [filePath],
    chooseLocalAudioFiles: async () => [],
    readLocalLyrics,
  };

  render(<App />);
  await waitFor(() => {
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /玻璃夜航/ })).toBeInTheDocument();
  });

  fireEvent.click(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /玻璃夜航/ }));

  await waitFor(() => {
    expect(readLocalLyrics).toHaveBeenCalledWith(filePath);
  });
  await waitFor(() => {
    expect(screen.getByText('把歌词放回播放器')).toBeInTheDocument();
  });

  delete window.teaMusicBackend;
});
```

If the list aria label is still mojibake in the current file, update the implementation and existing tests together to the readable label `歌曲列表`.

- [ ] **Step 2: Run the failing LRC test**

Run:

```bash
npx vitest run src/App.test.tsx -t "sidecar lyrics"
```

Expected: FAIL because `App.tsx` currently does not call `readLocalLyrics`.

- [ ] **Step 3: Re-enable local lyric loading**

In `src/App.tsx`, import `parseLrc`:

```tsx
import { parseLrc } from './domain/music';
```

Add this effect near the existing artwork loading effect:

```tsx
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
```

- [ ] **Step 4: Verify LRC test passes**

Run:

```bash
npx vitest run src/App.test.tsx -t "sidecar lyrics"
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: restore sidecar lyric loading"
```

---

## Task 5: Replace List-First UI with Immersive Player Screen

**Files:**
- Create: `src/components/ImmersivePlayer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Update the default shell test to expect immersive UI**

Replace the current test named `renders a single-screen minimal player without sidebar, toolbar or playlists` with:

```tsx
it('renders an immersive now-playing screen by default', () => {
  render(<App />);

  expect(screen.getByLabelText('沉浸播放页')).toBeInTheDocument();
  expect(screen.getByLabelText('歌词预览')).toBeInTheDocument();
  expect(screen.getByLabelText('打开歌曲列表')).toBeInTheDocument();
  expect(screen.queryByLabelText('歌曲列表')).not.toBeInTheDocument();
  expect(screen.queryByText('今日循环')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the failing immersive shell test**

Run:

```bash
npx vitest run src/App.test.tsx -t "immersive now-playing"
```

Expected: FAIL because the current app renders the list as the default content.

- [ ] **Step 3: Create `ImmersivePlayer`**

Create `src/components/ImmersivePlayer.tsx`:

```tsx
import { Heart, ListMusic, MoreHorizontal, Pause, Play, Repeat, Repeat1, Search, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { LyricStage } from './LyricStage';
import { Track, formatPlaybackTime, getTrackBadge } from '../domain/music';

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
  menu: React.ReactNode;
}

const playbackModeCopy: Record<PlaybackMode, string> = {
  queue: '顺序播放',
  'repeat-one': '单曲循环',
  shuffle: '随机播放',
};

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
      <header className="immersive-top">
        <button aria-label="打开歌曲列表" onClick={onOpenLibrary}>
          <ListMusic size={18} />
        </button>
        <span>TeaMusic</span>
        <button aria-label="搜索" onClick={onOpenSearch}>
          <Search size={18} />
        </button>
      </header>

      <div className="immersive-cover-wrap">
        {currentTrack.coverUrl ? (
          <img className="immersive-cover" src={currentTrack.coverUrl} alt="" />
        ) : (
          <div className="immersive-cover fallback" aria-hidden="true" />
        )}
      </div>

      <div className="immersive-meta">
        <h2>{currentTrack.title}</h2>
        <span>{currentTrack.album ? `${currentTrack.artist} · ${currentTrack.album}` : currentTrack.artist}</span>
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
        <button aria-label={`播放模式：${playbackModeCopy[playbackMode]}`} onClick={onCyclePlaybackMode}>
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
```

- [ ] **Step 4: Wire `ImmersivePlayer` into `App.tsx`**

Replace the main list content and existing `footer.player-bar` default display with `ImmersivePlayer`. Keep the hidden file input, drag/drop shell, search bar, menus, finder overlay, and `<audio>` element. Pass existing handlers:

```tsx
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
  menu={isTrackMenuOpen ? currentTrackMenu : null}
/>
```

Create `currentTrackMenu` as a local constant before `return`, reusing the existing track menu buttons for search, local import, online finder, remove local, reveal local, and volume.

- [ ] **Step 5: Add immersive CSS**

In `src/styles/global.css`, add:

```css
.content {
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.immersive-player {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto auto auto minmax(120px, 1fr) auto auto;
  height: 100%;
  padding: 18px 22px 24px;
  color: var(--theme-text-strong, rgba(255, 255, 255, 0.94));
}

.immersive-top,
.immersive-controls,
.immersive-progress {
  display: flex;
  align-items: center;
}

.immersive-top {
  justify-content: space-between;
  min-height: 34px;
  font-size: 15px;
  font-weight: 720;
  -webkit-app-region: drag;
}

.immersive-top button,
.immersive-controls button {
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.immersive-cover-wrap {
  display: grid;
  place-items: center;
  padding: 18px 0 14px;
}

.immersive-cover {
  width: min(72vw, 286px);
  aspect-ratio: 1;
  border-radius: 20px;
  object-fit: cover;
  background: linear-gradient(145deg, var(--theme-accent-soft), rgba(255, 255, 255, 0.08));
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
}

.immersive-meta {
  display: grid;
  justify-items: center;
  gap: 5px;
  min-width: 0;
  text-align: center;
}

.immersive-meta h2 {
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  font-size: 24px;
  line-height: 1.16;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.immersive-meta span {
  max-width: 100%;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.immersive-meta em {
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 42%, transparent);
  border-radius: 999px;
  background: var(--theme-accent-soft);
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-style: normal;
}

.immersive-progress {
  gap: 10px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 12px;
}

.immersive-controls {
  position: relative;
  justify-content: center;
  gap: 12px;
  padding-top: 16px;
}

.immersive-controls button {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.78);
}

.immersive-controls button:hover,
.immersive-controls button.active {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.immersive-controls .play-button {
  width: 58px;
  height: 58px;
  background: rgba(255, 255, 255, 0.94);
  color: #101114;
}
```

- [ ] **Step 6: Verify immersive shell test passes**

Run:

```bash
npx vitest run src/App.test.tsx -t "immersive now-playing"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/ImmersivePlayer.tsx src/App.tsx src/App.test.tsx src/styles/global.css
git commit -m "feat: make immersive player the default screen"
```

---

## Task 6: Add Drawer-Based Unified Library

**Files:**
- Create: `src/components/LibraryDrawer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Add failing drawer tests**

Append to `src/App.test.tsx`:

```tsx
it('opens the library drawer and selects a track', () => {
  render(<App />);

  fireEvent.click(screen.getByLabelText('打开歌曲列表'));

  const drawer = screen.getByRole('dialog', { name: '歌曲列表' });
  expect(drawer).toBeInTheDocument();

  fireEvent.click(within(drawer).getByRole('button', { name: /晴夜漫游/ }));

  expect(within(screen.getByLabelText('沉浸播放页')).getByRole('heading', { name: '晴夜漫游' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: '歌曲列表' })).not.toBeInTheDocument();
});

it('filters tracks inside the library drawer', () => {
  render(<App />);

  fireEvent.click(screen.getByLabelText('打开歌曲列表'));
  fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、专辑'), { target: { value: 'Tizzy' } });

  const drawer = screen.getByRole('dialog', { name: '歌曲列表' });
  expect(within(drawer).getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
  expect(within(drawer).queryByRole('button', { name: /晴夜漫游/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the failing drawer tests**

Run:

```bash
npx vitest run src/App.test.tsx -t "library drawer"
```

Expected: FAIL because no drawer exists.

- [ ] **Step 3: Implement `LibraryDrawer`**

Create `src/components/LibraryDrawer.tsx`:

```tsx
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
            placeholder="搜索歌曲、歌手、专辑"
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
```

- [ ] **Step 4: Wire drawer state in `App.tsx`**

Add:

```tsx
const [isLibraryDrawerOpen, setIsLibraryDrawerOpen] = useState(false);
```

Render:

```tsx
{isLibraryDrawerOpen ? (
  <LibraryDrawer
    tracks={filteredTracks}
    currentTrackId={currentTrackId}
    isPlaying={isPlaying}
    query={query}
    onQueryChange={setQuery}
    onClose={() => setIsLibraryDrawerOpen(false)}
    onSelectTrack={selectTrack}
  />
) : null}
```

Update Escape handling:

```tsx
if (isLibraryDrawerOpen || isLyricsFullscreenOpen || isTrackMenuOpen || isVolumeOpen || isSearchOpen || isFinderOpen) {
  event.preventDefault();
  setIsLibraryDrawerOpen(false);
  setIsLyricsFullscreenOpen(false);
  setIsTrackMenuOpen(false);
  setIsVolumeOpen(false);
  setIsSearchOpen(false);
  setIsFinderOpen(false);
}
```

- [ ] **Step 5: Add drawer CSS**

Append:

```css
.library-drawer-shell,
.library-drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 58;
}

.library-drawer-scrim {
  background: rgba(3, 5, 8, 0.45);
}

.library-drawer {
  position: absolute;
  right: 10px;
  bottom: 10px;
  left: 10px;
  z-index: 59;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  max-height: min(72vh, 620px);
  padding: 12px;
  border-radius: 22px;
  animation: drawer-rise 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.library-drawer-head,
.drawer-search {
  display: flex;
  align-items: center;
}

.library-drawer-head {
  justify-content: space-between;
  padding: 2px 4px 10px;
}

.library-drawer-head button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.drawer-search {
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
}

.drawer-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}

.drawer-list {
  overflow-y: auto;
  padding-top: 10px;
  scrollbar-width: none;
}

.drawer-list::-webkit-scrollbar {
  display: none;
}

@keyframes drawer-rise {
  from {
    transform: translateY(24px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

- [ ] **Step 6: Verify drawer tests pass**

Run:

```bash
npx vitest run src/App.test.tsx -t "library drawer"
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/components/LibraryDrawer.tsx src/App.tsx src/App.test.tsx src/styles/global.css
git commit -m "feat: move library into immersive drawer"
```

---

## Task 7: Apply Cover Theme Variables to the Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Add a theme-variable integration test**

Add to `src/App.test.tsx`:

```tsx
it('applies cover and theme variables to the app shell', () => {
  render(<App />);

  const shell = document.querySelector('.app-shell') as HTMLElement;
  expect(shell.style.getPropertyValue('--app-cover')).toContain('url(');
  expect(shell.style.getPropertyValue('--theme-accent')).toBeTruthy();
  expect(document.querySelector('.app-backdrop')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the failing theme test**

Run:

```bash
npx vitest run src/App.test.tsx -t "theme variables"
```

Expected: FAIL until `useDominantTheme` is merged into the shell style.

- [ ] **Step 3: Use the theme hook in `App.tsx`**

Import:

```tsx
import { useDominantTheme } from './hooks/useDominantTheme';
```

Inside `App`:

```tsx
const coverTheme = useDominantTheme(currentTrack.coverUrl);
const shellStyle = {
  ...coverTheme,
  ...(currentTrack.coverUrl ? { '--app-cover': `url("${currentTrack.coverUrl}")` } : {}),
} as CSSProperties;
```

Update shell:

```tsx
<div
  className={isDragActive ? 'app-shell dragging-local' : 'app-shell'}
  style={shellStyle}
  ...
>
```

- [ ] **Step 4: Update CSS to consume variables**

Change accent-specific values:

```css
.playing-bars i {
  background: var(--theme-accent);
}

.transport .mode-active,
.immersive-controls button.active {
  background: var(--theme-accent-soft);
  color: var(--theme-text-strong);
}

.progress-slider {
  accent-color: var(--theme-accent);
}
```

- [ ] **Step 5: Verify theme test passes**

Run:

```bash
npx vitest run src/App.test.tsx -t "theme variables"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/App.tsx src/App.test.tsx src/styles/global.css
git commit -m "feat: apply cover-derived theme variables"
```

---

## Task 8: Clean Up Tests, Text, and README

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/styles/global.css`
- Modify: `README.md`

- [ ] **Step 1: Replace obsolete no-lyrics/no-immersive assertions**

In `src/App.test.tsx`, remove or rewrite assertions that expect:

```tsx
expect(screen.queryByLabelText('歌词预览')).not.toBeInTheDocument();
expect(screen.queryByRole('dialog', { name: '全屏歌词' })).not.toBeInTheDocument();
expect(screen.queryByLabelText('歌曲列表')).toBeInTheDocument();
```

Replace them with current expectations:

```tsx
expect(screen.getByLabelText('沉浸播放页')).toBeInTheDocument();
expect(screen.getByLabelText('歌词预览')).toBeInTheDocument();
expect(screen.queryByRole('dialog', { name: '歌曲列表' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Remove stale CSS blocks that are no longer rendered**

Delete selectors only after `rg` confirms no JSX uses them:

```bash
rg "player-focus|feature-grid|music-card|queue-drawer|queue-chip|topbar|lib-menu" src
```

Expected: Any selector with no JSX usage can be removed from `src/styles/global.css`. Keep `.track-row`, `.playing-bars`, `.track-menu`, `.finder-*`, `.volume-*`, and `.app-backdrop`.

- [ ] **Step 3: Update README product description**

Replace the feature bullets that say there are no lyrics or no immersive page with:

```md
- **汽水音乐式沉浸播放页**：启动后默认进入正在播放，大封面、歌词、进度和主控件组成第一屏。
- **封面驱动整窗色彩**：当前歌曲封面生成模糊背景和主题强调色，切歌时平滑过渡。
- **动态歌词**：支持 LRC 滚动、当前行逐字高亮、光晕扫过和全屏歌词模式。
- **抽屉式统一曲库**：本地、已补全和示例歌曲仍在同一个列表里，通过歌曲列表抽屉快速选歌。
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/App.test.tsx src/styles/global.css README.md
git commit -m "docs: update TeaMusic immersive player copy"
```

---

## Task 9: Visual Smoke Test at Desktop Portrait Sizes

**Files:**
- Modify only if visual defects are found: `src/styles/global.css`, `src/App.tsx`, component files.

- [ ] **Step 1: Start the web dev server**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite serves `http://127.0.0.1:5173/`.

- [ ] **Step 2: Inspect these viewport sizes**

Use the in-app browser or normal browser:

```text
420x820
360x620
500x900
```

Expected:
- Main screen opens on immersive now-playing, not drawer.
- Cover is fully visible and not cropped awkwardly.
- Current lyric does not overlap title or controls.
- Bottom controls remain reachable at 360x620.
- Drawer max-height does not hide its close button.
- Fullscreen lyrics can close with button and Esc.

- [ ] **Step 3: Fix any visual defects with focused CSS changes**

Common fixes:

```css
@media (max-height: 680px) {
  .immersive-cover {
    width: min(54vw, 210px);
  }

  .lyric-line.active {
    font-size: 19px;
  }

  .immersive-player {
    padding-bottom: 16px;
  }
}
```

- [ ] **Step 4: Re-run full verification after any fixes**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 5: Commit visual fixes if made**

Run:

```bash
git add src
git commit -m "fix: polish immersive portrait layout"
```

---

## Self-Review

- **Spec coverage:** Tasks cover lyric timing, cover theme variables, synced lyric UI, local LRC restore, immersive default screen, drawer list, README updates, and visual smoke testing.
- **Placeholder scan:** No unresolved placeholder instructions remain. Each code-producing task includes concrete code or exact replacement text.
- **Type consistency:** `PlaybackMode`, `Track`, `LyricLine`, `useDominantTheme`, `LyricStage`, `ImmersivePlayer`, and `LibraryDrawer` names are consistent across tasks.
- **Risk note:** Some current tests and source labels are mojibake. During execution, update affected app labels and tests together to readable Chinese strings instead of preserving broken encoded labels.
