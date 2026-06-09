# Pure Soda Music Implementation Plan

**Feature:** Pure Mac-style Qishui-inspired music player
**Goal:** Build a pure listening and music-library app with glass UI, local music support, dynamic recommendations, and background library completion.
**Acceptance Criteria:**
- The app has no social, commerce, account-growth, publishing, campaign, or download-center surfaces.
- The primary UI includes only discovery, library, local music, favorites, playlists, player, queue, and lyrics.
- Local audio files can be imported, played, and visibly marked as `本地`.
- Missing searched tracks can be queued for background completion using `/Users/taomic/musicol/downloader.js`, then imported and marked `已补全`.
- Recommendation content updates from listening history, likes, local imports, resolved downloads, and skips.
- The interface uses a dark translucent glass material system inspired by Qishui Music's Mac client.
- Desktop and narrower-window layouts avoid text overlap and keep player controls usable.
**Architecture:** Create a local Electron + Vite + React app so the UI can access filesystem imports and run the Node downloader safely. Use a small domain layer for tracks, playlists, recommendations, and resolver jobs. Keep the downloader hidden behind a background resolver service.
**Tech Stack:** Electron, Vite, React, TypeScript, Vitest, Testing Library, Playwright, lucide-react, Node child process wrapper for the existing downloader.
**前端验证:** Yes — Browser/Playwright screenshots required for desktop and narrow windows.

---

## Straight-Line Check

**B definition:** A user can open the app, browse recommendations, search the library, play music, import local tracks, and let the app quietly fill missing tracks in the background.

**What we are not building:** social features, memberships, marketing pages, video publishing, creator tools, comments, followers, heavy account settings, visible download center, desktop widgets.

**Terminal schema:**

```ts
export type TrackSource = 'catalog' | 'local' | 'resolved';
export type ResolveStatus = 'none' | 'queued' | 'resolving' | 'resolved' | 'failed';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  source: TrackSource;
  filePath?: string;
  coverUrl?: string;
  lyrics?: LyricLine[];
  liked: boolean;
  playCount: number;
  lastPlayedAt?: string;
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
```

## Task 1: Scaffold App Shell

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/global.css`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

**Step 1: Write failing smoke test**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('renders pure music navigation only', () => {
    render(<App />);
    expect(screen.getByText('发现')).toBeInTheDocument();
    expect(screen.getByText('曲库')).toBeInTheDocument();
    expect(screen.getByText('本地音乐')).toBeInTheDocument();
    expect(screen.queryByText('社区')).not.toBeInTheDocument();
    expect(screen.queryByText('会员')).not.toBeInTheDocument();
    expect(screen.queryByText('下载中心')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because project and component do not exist.

**Step 3: Scaffold minimal Electron/Vite/React app**

Create the package scripts:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://127.0.0.1:5173 && electron .\"",
    "test": "vitest",
    "test:ui": "playwright test",
    "build": "vite build"
  }
}
```

Create a minimal `App` with the four allowed nav entries and no surrounding product features.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS.

## Task 2: Domain Model And Source Badges

**Files:**
- Create: `src/domain/music.ts`
- Create: `src/domain/music.test.ts`
- Modify: `src/App.tsx`

**Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { getTrackBadge, isPureFeatureAllowed } from './music';

describe('track source badges', () => {
  it('marks local and resolved tracks without exposing downloader as a feature', () => {
    expect(getTrackBadge({ source: 'local', resolveStatus: 'none' })).toBe('本地');
    expect(getTrackBadge({ source: 'resolved', resolveStatus: 'resolved' })).toBe('已补全');
    expect(getTrackBadge({ source: 'catalog', resolveStatus: 'resolving' })).toBe('补全中');
  });

  it('rejects non-music surfaces', () => {
    expect(isPureFeatureAllowed('comments')).toBe(false);
    expect(isPureFeatureAllowed('membership')).toBe(false);
    expect(isPureFeatureAllowed('download-center')).toBe(false);
    expect(isPureFeatureAllowed('player')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/domain/music.test.ts`

Expected: FAIL because functions do not exist.

**Step 3: Implement domain helpers**

Implement `Track`, `Playlist`, `ResolverJob`, `getTrackBadge`, and `isPureFeatureAllowed`.

**Step 4: Run tests**

Run: `npm test -- --run src/domain/music.test.ts src/App.test.tsx`

Expected: PASS.

## Task 3: Glass Layout And Player Frame

**Files:**
- Create: `src/components/Shell.tsx`
- Create: `src/components/PlayerBar.tsx`
- Create: `src/components/GlassCard.tsx`
- Create: `src/components/Shell.test.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/App.tsx`

**Step 1: Write failing UI tests**

Test that shell renders only allowed navigation, top search, background resolver status, and bottom player.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/Shell.test.tsx`

Expected: FAIL because components do not exist.

**Step 3: Implement glass shell**

Use:

- `grid-template-columns: 204px 1fr`
- `grid-template-rows: 48px 1fr 78px`
- dark translucent panels
- `backdrop-filter: blur(32px)`
- border `rgba(255,255,255,.08-.18)`
- no marketing hero and no nested cards inside cards

**Step 4: Run tests**

Run: `npm test -- --run src/components/Shell.test.tsx src/App.test.tsx`

Expected: PASS.

## Task 4: Playback State And Queue

**Files:**
- Create: `src/state/playerStore.ts`
- Create: `src/state/playerStore.test.ts`
- Create: `src/components/Queue.tsx`
- Modify: `src/components/PlayerBar.tsx`

**Step 1: Write failing store tests**

Cover play, pause, next, previous, seek, like, queue replacement, and play count updates.

**Step 2: Run failing tests**

Run: `npm test -- --run src/state/playerStore.test.ts`

Expected: FAIL.

**Step 3: Implement player store**

Use a simple reducer/store first. Avoid audio engine complexity until UI is wired.

**Step 4: Run tests**

Run: `npm test -- --run src/state/playerStore.test.ts`

Expected: PASS.

## Task 5: Local Music Import

**Files:**
- Create: `src/services/localLibrary.ts`
- Create: `src/services/localLibrary.test.ts`
- Create: `electron/libraryIpc.ts`
- Modify: `electron/preload.ts`
- Modify: `src/domain/music.ts`
- Modify: `src/components/LocalMusicView.tsx`

**Step 1: Write failing tests**

Test file extension filtering, metadata fallback from filename, stable IDs, and `source: 'local'`.

**Step 2: Run failing tests**

Run: `npm test -- --run src/services/localLibrary.test.ts`

Expected: FAIL.

**Step 3: Implement local scanner**

Support `.mp3`, `.m4a`, `.aac`, `.wav`, `.flac`, `.ogg`. Use filesystem APIs in Electron main and expose safe methods through preload.

**Step 4: Run tests**

Run: `npm test -- --run src/services/localLibrary.test.ts`

Expected: PASS.

## Task 6: Hidden Background Resolver

**Files:**
- Create: `src/services/resolver.ts`
- Create: `src/services/resolver.test.ts`
- Create: `electron/resolverIpc.ts`
- Create: `electron/downloaderRunner.ts`
- Modify: `electron/main.ts`
- Modify: `src/components/SearchView.tsx`

**Step 1: Write failing tests**

Test that a missing query creates a resolver job, status changes to `queued`, then `resolving`, then `resolved` or `failed`, without exposing a download-center route.

**Step 2: Run failing tests**

Run: `npm test -- --run src/services/resolver.test.ts`

Expected: FAIL.

**Step 3: Implement downloader wrapper**

Use `/Users/taomic/musicol/downloader.js` through a child process first:

```ts
spawn('node', [
  '/Users/taomic/musicol/downloader.js',
  '--keyword',
  query,
  '--limit',
  '1',
  '--out',
  libraryResolvedDir
]);
```

Parse completion from process exit and scan the output directory into the library. Keep source-site details out of the UI.

**Step 4: Run tests**

Run: `npm test -- --run src/services/resolver.test.ts`

Expected: PASS.

## Task 7: Recommendations

**Files:**
- Create: `src/services/recommendations.ts`
- Create: `src/services/recommendations.test.ts`
- Create: `src/components/DiscoverView.tsx`
- Modify: `src/App.tsx`

**Step 1: Write failing tests**

Test scoring from likes, recent plays, local imports, resolved tracks, skips, and scene tags.

**Step 2: Run failing tests**

Run: `npm test -- --run src/services/recommendations.test.ts`

Expected: FAIL.

**Step 3: Implement recommendation engine**

Keep it deterministic and local. Sections:

- 每日推荐
- 场景电台
- 热歌榜
- 歌单漫游
- 相似推荐
- 本地新歌

**Step 4: Run tests**

Run: `npm test -- --run src/services/recommendations.test.ts`

Expected: PASS.

## Task 8: Search And Unified Library

**Files:**
- Create: `src/services/search.ts`
- Create: `src/services/search.test.ts`
- Create: `src/components/SearchView.tsx`
- Create: `src/components/LibraryView.tsx`
- Modify: `src/App.tsx`

**Step 1: Write failing tests**

Test search across catalog, local, resolved tracks, and missing-result resolver queueing.

**Step 2: Run failing tests**

Run: `npm test -- --run src/services/search.test.ts`

Expected: FAIL.

**Step 3: Implement unified search**

Search result statuses:

- playable
- local
- resolving
- resolved
- unavailable with subtle retry

**Step 4: Run tests**

Run: `npm test -- --run src/services/search.test.ts`

Expected: PASS.

## Task 9: Lyrics And Player View

**Files:**
- Create: `src/components/PlayerView.tsx`
- Create: `src/components/LyricsView.tsx`
- Create: `src/components/LyricsView.test.tsx`
- Modify: `src/state/playerStore.ts`

**Step 1: Write failing tests**

Test synced lyric line selection and fallback rendering.

**Step 2: Run failing tests**

Run: `npm test -- --run src/components/LyricsView.test.tsx`

Expected: FAIL.

**Step 3: Implement player view**

Large cover, dynamic blurred background, lyrics scroller with vertical mask, queue side panel.

**Step 4: Run tests**

Run: `npm test -- --run src/components/LyricsView.test.tsx`

Expected: PASS.

## Task 10: End-To-End And Visual Verification

**Files:**
- Create: `tests/pure-music.spec.ts`
- Create: `playwright.config.ts`

**Step 1: Write failing Playwright test**

Test:

- app loads
- forbidden nav labels do not exist
- search missing track shows subtle resolver state
- local track badge appears
- player controls are usable

**Step 2: Run failing E2E**

Run: `npm run test:ui`

Expected: FAIL until app is wired.

**Step 3: Wire routes and final UI**

Finish route switching, mock catalog data, local import states, and resolver status wiring.

**Step 4: Run full verification**

Run:

```bash
npm test -- --run
npm run build
npm run test:ui
```

Expected: all pass.

**Step 5: Browser visual review**

Open dev server and inspect:

- desktop width around 1440px
- narrower width around 900px
- player view
- local music empty and populated states
- search resolving state

Expected: no overlapping text, no visible social/commerce/download-center surfaces, glass materials visible and polished.
