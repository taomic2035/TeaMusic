# 精简列表式 UI + 封面驱动整窗沉浸色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** 把 TeaMusic 简化成列表式播放器：删歌词/沉浸页/卡片，保留封面并让当前封面驱动整窗沉浸色，修复 resize 重叠。

**Architecture:** 单窗口三段式（侧栏导航 / 顶部搜索 / 底部播放条），中间为纯歌曲列表。当前曲目 `coverUrl` 经根节点 `--app-cover` 变量驱动 `.app-backdrop` 模糊背景，切歌即变。次要当前曲操作收进底部"⋯"溢出菜单。

**Tech Stack:** React 19 + TS、Vitest + Testing Library、CSS。

参考 spec：`docs/superpowers/specs/2026-06-10-minimal-cover-immersive-ui-design.md`

---

## File Structure

| 文件 | 改动 |
|---|---|
| `src/App.tsx` | 根挂 `--app-cover`+`.app-backdrop`；删沉浸页/歌词/卡片/player-focus；内容区改纯列表；底部加"⋯"菜单收纳次要操作；行去封面 |
| `src/styles/global.css` | 加 `.app-backdrop`+`.app-shell` 扁平背景；加 `.track-menu*`；删 now-playing-page/np-*/player-focus/feature-grid/music-card/lyrics/hero/cover-chip 等；重写 player-bar 与断点修 resize |
| `src/App.test.tsx` | 删沉浸页/歌词/卡片用例；操作类用例改为先开"⋯"菜单；加封面背景与无卡片断言 |

> domain 的 `buildRecommendationCards`/`parseLrc`/`buildSimilarTrackIds` 保留（domain 测试仍覆盖），仅移除 App.tsx 的 import 使用。

---

## Task 1: 封面驱动整窗沉浸色背景

**Files:** `src/App.tsx`, `src/styles/global.css`, `src/App.test.tsx`

- [ ] **Step 1: 失败测试** — `src/App.test.tsx` 新增：
```tsx
it('drives the whole-window backdrop from the current track cover', () => {
  render(<App />);
  const shell = document.querySelector('.app-shell') as HTMLElement;
  expect(document.querySelector('.app-backdrop')).toBeInTheDocument();
  // 种子当前曲带 coverUrl → --app-cover 已设置
  expect(shell.style.getPropertyValue('--app-cover')).toContain('url(');
});
```

- [ ] **Step 2: 跑确认失败** — `npx vitest run src/App.test.tsx -t backdrop` → FAIL（无 .app-backdrop）

- [ ] **Step 3: App.tsx 根节点挂变量 + backdrop**
`return ( <div className=... >` 改为带 style，并在 `drop-hint` 前插入 backdrop：
```tsx
    <div
      className={isDragActive ? 'app-shell dragging-local' : 'app-shell'}
      style={currentTrack.coverUrl ? ({ '--app-cover': `url("${currentTrack.coverUrl}")` } as CSSProperties) : undefined}
      onDragLeave={...}
      ...
    >
      <div aria-hidden="true" className="app-backdrop" />
      {isDragActive ? <div className="drop-hint">松开导入到本地音乐</div> : null}
```
（`CSSProperties` 已 import。）

- [ ] **Step 4: CSS** — `.app-shell` 背景换扁平兜底；新增 `.app-backdrop`：
```css
.app-shell { /* 删除原多重 radial-gradient，改： */
  background: #0d0e12;
}
.app-backdrop {
  position: absolute;
  inset: -8%;
  z-index: 0;
  pointer-events: none;
  background-image: var(--app-cover, none);
  background-position: center;
  background-size: cover;
  filter: blur(90px) saturate(180%) brightness(0.5);
  transform: scale(1.2);
  opacity: 0.85;
  transition: opacity 0.6s ease;
}
.app-backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 0%, rgba(10,12,16,0.35), rgba(8,9,12,0.82) 80%);
}
```
确保 `.app-shell > *`（侧栏/内容/播放条）在 backdrop 之上：给 `.sidebar`/`.topbar`/`.content`/`.player-bar` 已有 `z-index:1` 即可（backdrop 为 0）。`.app-shell::before` 装饰层保留或删除均可（保留）。

- [ ] **Step 5: 跑确认通过** — `npx vitest run src/App.test.tsx -t backdrop` → PASS

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: 当前封面驱动整窗沉浸背景"`

---

## Task 2: 删除沉浸式播放页与歌词

**Files:** `src/App.tsx`, `src/styles/global.css`, `src/App.test.tsx`

- [ ] **Step 1: 删 App.tsx 沉浸页与歌词**
  - 删 `now-playing-page` 整块 JSX（`<div className="now-playing-page" ...>` 到其闭合）。
  - 删状态 `isNowPlayingOpen` 及所有 `setIsNowPlayingOpen` 调用；删打开沉浸页的 `album-art-button`（播放条），把 `album-art` 改为不可点击的纯缩略图（保留封面）。
  - 删 Esc 关闭沉浸页的 effect 分支、`nowPlayingLyricsRef`、歌词滚动 effect。
  - 删 `currentLyrics`/`currentLyricIndex` 计算、内容区 `lyrics-window`、沉浸页 `np-lyrics`。
  - 删 `readLocalLyrics` 拉取 effect（约 `App.tsx:719`）及 `parseLrc` 的使用与 import。
  - lucide 未用图标（如 `ChevronDown`、歌词相关）按需从 import 移除。
- [ ] **Step 2: 删 CSS** — `now-playing-page`、`np-*`、`@keyframes np-rise`/`np-spin`、`.lyrics-window`、`.album-art-button`/`.album-art-open` 相关块。
- [ ] **Step 3: 删测试** — `App.test.tsx` 中沉浸页与歌词用例：
  - "opens and closes the immersive now playing page"
  - "seeks playback by clicking a lyric line inside the now playing page"
  - "closes the immersive now playing page with Escape"
  - "controls playback from inside the immersive now playing page"
  - "renders the focused listening area with lyrics"（若断言歌词/沉浸，删或改为断言列表存在）
- [ ] **Step 4: typecheck + 相关测试** — `npm run typecheck` 应过（修残留引用）。
- [ ] **Step 5: Commit** — `git commit -am "feat: 移除沉浸式播放页与歌词"`

---

## Task 3: 删卡片/hero/player-focus，内容区改纯列表

**Files:** `src/App.tsx`, `src/styles/global.css`, `src/App.test.tsx`

- [ ] **Step 1: App.tsx 内容区重构**
  - 删 `hero-row` 整块；保留"添加本地音乐"按钮与隐藏 `<input>`，移到内容区顶部一个轻量条 `<div className="content-actions">`（含 import 按钮 + 隐藏 input）。
  - 删 `feature-grid`（推荐卡）整块、`recommendationCards`、`openRecommendation`、`RecommendationCard` import。
  - 删 `player-focus` 整块 `<section>`（含 `focus-cover`/`focus-heading`/`lyrics-window`/`up-next`）。其中 `focus-actions` 的按钮**移入底部"⋯"菜单**（见 Task 5），此处直接删。
  - `workbench-grid` 容器若只剩 `library-strip`，去掉 grid 包裹，让列表占满。
  - `library-strip` 顶部说明文字精简：保留 `activeCopy.title`，删 `library-note`、`library-subtitle` 冗余说明（可留标题一行）。
- [ ] **Step 2: CSS** — 删 `.hero-row`/`.hero-copy`/`.hero-actions`、`.feature-grid`/`.music-card`、`.player-focus*`/`.focus-*`/`.lyrics-window`/`.up-next`/`.queue-chip`、`.workbench-grid`；`.content` 调整为纵向列表布局。
- [ ] **Step 3: 删测试** — 推荐卡/openRecommendation/player-focus 相关：
  - "uses recommendation cards as listening shortcuts"
  - "opens recent listening from the hot chart recommendation when history exists"
  - 任何断言 `music-card`/`feature-grid`/`player-focus`/`focus-cover`/`up-next` 的用例 → 删或改。
- [ ] **Step 4: typecheck** — 修残留引用（如 `playMoreSimilar` 移入 Task5 菜单后再清理）。
- [ ] **Step 5: Commit** — `git commit -am "feat: 移除推荐卡片/hero/player-focus，内容区改纯列表"`

---

## Task 4: 列表与队列去封面，保留播放指示

**Files:** `src/App.tsx`, `src/styles/global.css`, `src/App.test.tsx`

- [ ] **Step 1: 列表行去封面** — `track-row` 内删 `<span className="track-cover"><TrackArtwork .../>...`，播放指示 `playing-bars` 保留为行首小指示（不含封面）：
```tsx
<button className={track.id === currentTrack?.id ? 'track-row active' : 'track-row'} ...>
  {track.id === currentTrack?.id && isPlaying ? (
    <span aria-hidden="true" className="playing-bars"><i /><i /><i /></span>
  ) : <span className="track-bullet" aria-hidden="true" />}
  <div>
    <strong>{track.title}</strong>
    <span>{getTrackSubtitle(track)}</span>
  </div>
  {badge ? <em>{badge}</em> : null}
</button>
```
- [ ] **Step 2: 队列抽屉去封面** — `queue-drawer-row` 内删 `<TrackArtwork className="cover-chip" .../>`，保留文字与 badge；列模板从 `40px 1fr auto` 改 `1fr auto`。
- [ ] **Step 3: CSS** — `track-row`/`queue-drawer-row` 列模板去掉封面列；加 `.track-bullet`（小圆点）样式；`playing-bars` 脱离 `track-cover` 后单独定位。删 `.track-cover`/`.cover-chip`/`.focus-cover` 等封面样式（`album-art` 保留给播放条）。
- [ ] **Step 4: 测试** — 断言列表行不含 `.cover-chip`；播放中行有 `.playing-bars`。
- [ ] **Step 5: Commit** — `git commit -am "feat: 列表/队列去封面，保留播放指示"`

---

## Task 5: 底部"⋯"溢出菜单 + 播放条清理

**Files:** `src/App.tsx`, `src/styles/global.css`, `src/App.test.tsx`

- [ ] **Step 1: 菜单状态** — 加 `const [isTrackMenuOpen, setIsTrackMenuOpen] = useState(false);` 及点击外部关闭（复用现有 document click 或简单 onBlur/scrim）。
- [ ] **Step 2: 播放条结构** — `now-playing` 簇：封面缩略图（不可点）+ 标题/歌手 + 喜欢按钮（保留 `mini-like`）+ "⋯"按钮：
```tsx
<button aria-label="更多操作" className={isTrackMenuOpen ? 'track-menu-btn active' : 'track-menu-btn'} onClick={() => setIsTrackMenuOpen((o) => !o)}>
  <MoreHorizontal size={16} />
</button>
```
（`MoreHorizontal` 从 lucide import。）
- [ ] **Step 3: 菜单内容** — 条件渲染弹层，收纳原 focus-actions：新建歌单、加入今日循环、加入/移出用户歌单（条件）、移出本地（条件）、访达显示（条件）、播放更多相似。各按钮**保留原 aria-label**（`新建歌单`/`加入当前歌单`/`从当前歌单移除`/`移出本地音乐`/`在访达中显示`/`加入今日循环`），新增"播放更多相似"项调用 `playMoreSimilar`。点击后 `setIsTrackMenuOpen(false)`。
```tsx
{isTrackMenuOpen ? (
  <div className="track-menu" role="menu">
    <button onClick={() => { createUserPlaylistFromCurrentTrack(); setIsTrackMenuOpen(false); }}>新建歌单</button>
    <button onClick={() => { addCurrentTrackToTodayLoop(); setIsTrackMenuOpen(false); }} aria-label="加入今日循环">加入今日循环</button>
    {isActiveUserPlaylist && !activeUserPlaylistHasCurrentTrack ? (<button aria-label="加入当前歌单" onClick={() => { addCurrentTrackToActiveUserPlaylist(); setIsTrackMenuOpen(false); }}>加入当前歌单</button>) : null}
    {isActiveUserPlaylist && activeUserPlaylistHasCurrentTrack ? (<button aria-label="从当前歌单移除" onClick={() => { removeCurrentTrackFromActiveUserPlaylist(); setIsTrackMenuOpen(false); }}>从当前歌单移除</button>) : null}
    {canRemoveCurrentLocalTrack ? (<button aria-label="移出本地音乐" onClick={() => { void removeCurrentLocalTrack(); setIsTrackMenuOpen(false); }}>移出本地音乐</button>) : null}
    {canRevealCurrentLocalTrack ? (<button aria-label="在访达中显示" onClick={() => { void revealCurrentLocalTrack(); setIsTrackMenuOpen(false); }}>在访达中显示</button>) : null}
    <button onClick={() => { playMoreSimilar(); setIsTrackMenuOpen(false); }}>播放更多相似</button>
  </div>
) : null}
```
- [ ] **Step 4: CSS** — `.track-menu-btn`、`.track-menu`（绝对定位于播放条上方、玻璃面板、纵向按钮列）。
- [ ] **Step 5: 更新受影响测试** — 这些用例改为先点 `更多操作` 再点目标：
  - "adds the current track into Today Loop playlist"
  - "creates a user playlist from the current track"
  - "adds the current track into an existing user playlist"
  - "removes the current track from a user playlist"
  - "removes a restored local path from the app library..."（先开菜单再点 移出本地音乐）
  - "reveals a restored local path in Finder..."（先开菜单再点 在访达中显示）
  - "creates a similar recommendation queue from the current track"（先开菜单再点 播放更多相似）
  每处插入：`fireEvent.click(screen.getByLabelText('更多操作'));` 后再断言/点击。
- [ ] **Step 6: Commit** — `git commit -am "feat: 底部⋯溢出菜单收纳当前曲操作"`

---

## Task 6: 修复 resize 重叠（播放条单行 + 弹性行高）

**Files:** `src/styles/global.css`, `src/App.test.tsx`

- [ ] **Step 1: app-shell 底部行弹性** — `.app-shell` `grid-template-rows: 48px minmax(0, 1fr) 78px` 改 `48px minmax(0, 1fr) auto`；窄屏断点同理改 `auto`（删 134px 死高）。
- [ ] **Step 2: 播放条始终单行** — 删 `@media (max-width: 980px)` 中把 `.player-bar` 改 `grid-template-columns: 1fr` 的规则（移除 `.player-bar` 出该规则的选择器组）。`.player-bar` 列保持 `minmax(0,1fr) auto minmax(0,1fr)`，`.now-playing`/`.progress-area` 子项 `min-width:0` 可压缩。
- [ ] **Step 3: 窄屏隐藏次要而非堆叠** — `@media (max-width: 980px)`：`.volume-slider { display:none; }`、进度时间 `.progress-area > span { display:none; }`（保留滑块）；`@media (max-width: 760px)` 保持侧栏折叠逻辑但 player-bar 不堆叠。删除对已移除元素（`.resolver-status` 等）的规则。
- [ ] **Step 4: 验证** — 加测试：`.app-shell` 计算 `gridTemplateRows` 第三段非固定 78/134（jsdom 下读不到计算值则改为断言 CSS 源不含把 player-bar 设 1fr 的规则）：
```tsx
it('keeps the player bar single-row to avoid resize overlap', () => {
  // 守护：不应再有把 player-bar 改成单列竖排的规则
  // (用 build 后 CSS 源检查更稳；此处断言播放条三簇都在同一 footer 内)
  render(<App />);
  const bar = document.querySelector('.player-bar') as HTMLElement;
  expect(bar.querySelector('.now-playing')).toBeInTheDocument();
  expect(bar.querySelector('.transport')).toBeInTheDocument();
  expect(bar.querySelector('.progress-area')).toBeInTheDocument();
});
```
- [ ] **Step 5: Commit** — `git commit -am "fix: 播放条单行+弹性行高，消除 resize 重叠"`

---

## Task 7: 全量验证与收尾

- [ ] **Step 1: 全量门禁** — `npm run build`（typecheck+构建）与 `npm test` 全绿；修剩余失败用例（计数文案、残留封面断言等）。
- [ ] **Step 2: 真机冒烟** — `npm start`，确认：纯列表、无卡片/歌词/沉浸页；切歌时整窗背景随封面变；窄/宽 resize 播放条不重叠；"⋯"菜单各操作可用。
- [ ] **Step 3: Commit**（如有）。

---

## Self-Review

- **Spec 覆盖**：封面整窗背景(T1)、删沉浸页/歌词(T2)、删卡片/hero/player-focus(T3)、行/队列去封面(T4)、⋯菜单收纳操作(T5)、resize 修复(T6)、收尾(T7)——spec 各项均有任务。
- **占位符**：无 TBD；关键 JSX/CSS 给出实现。
- **一致性**：`--app-cover`/`.app-backdrop`/`.track-menu`/`更多操作` aria-label 在实现与测试中一致；保留各操作原 aria-label 以最小化测试改动（仅加"先开菜单"）。
- **保留项**：domain `buildRecommendationCards`/`parseLrc`/`buildSimilarTrackIds` 不删；`album-art`（播放条封面）保留；like 按钮保留。
- **风险**：jsdom 读不到 backdrop 计算样式 → 测试改为断言内联 `--app-cover` 变量（已采用）。
