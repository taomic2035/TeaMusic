# 单屏手机竖屏式极简播放器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 去掉侧栏/视图/歌单/推荐/队列，做成竖屏窗口里的单列极简播放器：顶栏库菜单 + 统一列表 + 底部播放区，封面驱动整窗色保留。

**Architecture:** `.app-shell` 改单列三段（顶栏/列表/播放区）。App.tsx 删除 activeView/playlist/recommendation/queue 全部逻辑与渲染；列表 = `filterTracks(tracks, query)`，同时作为 playbackQueue。顶栏一个「库菜单」（搜索/导入/在线找歌），底部一个 ⋯（音量/睡眠/本地操作）。

**Tech Stack:** Electron、React 19 + TS、Vitest + Testing Library、CSS。

参考 spec：`docs/superpowers/specs/2026-06-10-portrait-single-screen-player-design.md`

---

## Task 1: 竖屏窗口
**Files:** `electron/main.cjs`, `electron/main-window.test.ts`
- [ ] main.cjs `BrowserWindow`：`width:420, height:820, minWidth:360, minHeight:620`。
- [ ] main-window.test.ts：`minWidth` 断言改为 `toBeLessThanOrEqual(420)`（保持兼容）。
- [ ] Commit。

## Task 2: App.tsx 删除视图/歌单/推荐/队列
**Files:** `src/App.tsx`
- [ ] 删类型与常量：`LibraryView`/`SystemPlaylistView`/`UserPlaylistView`/`PlaylistView`/`ActiveView`/`PlaylistConfig`/`PlaylistState`、`navItems`、`viewCopy`、`viewKicker`、`viewFilters`、`initialPlaylists`、`playlistStorageKey`、`restorePlaylists`/`persistPlaylists`、`isPlaylistView`/`isUserPlaylistView`。
- [ ] 删状态：`activeView`/`setActiveView`、`playlistState`/`setPlaylistState`、`isQueueOpen`/`setIsQueueOpen`。
- [ ] 删派生：`recentTracks`、`recommendationCards`(已无)、`activeCopy`/`activeKicker`、`isActiveUserPlaylist`/`activeUserPlaylistHasCurrentTrack`、`emptyState`(简化为常量消息)、`upcomingTracks`、playlist 持久化 effect。
- [ ] `filteredTracks` 改为 `const visibleTracks = useMemo(() => filterTracks(tracks, query), [tracks, query])`；`playbackQueue` 改为 = `visibleTracks`（删原基于 activeView 的计算）。
- [ ] 删函数：`playMoreSimilar`、`createUserPlaylistFromCurrentTrack`、`addCurrentTrackToActiveUserPlaylist`、`removeCurrentTrackFromActiveUserPlaylist`、`addCurrentTrackToTodayLoop`。`selectTrack`/`skipToNextTrack`/`moveInQueue` 等基于 playbackQueue 的保留。
- [ ] Esc 处理：删 `isQueueOpen`，改为关闭顶栏库菜单/底部菜单/找歌。
- [ ] typecheck 会报大量未用——逐步清理 import（`buildSimilarTrackIds` 等不再用则从 import 删）。
- [ ] （本任务结束时 JSX 仍引用已删变量，typecheck 红；Task 3 重写 JSX 后转绿）。

## Task 3: App.tsx 单列渲染（顶栏/列表/播放区/菜单）
**Files:** `src/App.tsx`
- [ ] 新状态：`isLibraryMenuOpen`、`isSearchOpen`、`isPlayerMenuOpen`（底部⋯）。保留 `isFinderOpen`、`isTrackMenuOpen`→复用为 `isPlayerMenuOpen`。
- [ ] 根 `.app-shell` 内：删 `<aside className="sidebar">` 整块。
- [ ] 顶栏 `<header className="topbar">`：
```tsx
<header className="topbar">
  <span className="app-title">汽水音乐</span>
  <button aria-label="菜单" className="lib-menu-btn" onClick={() => setIsLibraryMenuOpen((o) => !o)}><Menu size={18} /></button>
  {isLibraryMenuOpen ? (
    <>
      <div className="menu-scrim" aria-hidden="true" onClick={() => setIsLibraryMenuOpen(false)} />
      <div className="lib-menu glass-panel" role="menu">
        <button onClick={() => { setIsSearchOpen(true); setIsLibraryMenuOpen(false); }}>搜索</button>
        <button onClick={() => { void handleLocalImportClick(); setIsLibraryMenuOpen(false); }}>导入本地音乐</button>
        <button onClick={() => { setIsFinderOpen(true); setIsLibraryMenuOpen(false); }}>在线找歌</button>
      </div>
    </>
  ) : null}
</header>
{isSearchOpen ? (
  <div className="search-bar">
    <Search size={15} />
    <input ref={searchInputRef} autoFocus placeholder="搜索歌曲、歌手" value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setIsSearchOpen(false); } }} />
    <button aria-label="关闭搜索" onClick={() => { setQuery(''); setIsSearchOpen(false); }}><X size={14} /></button>
  </div>
) : null}
```
  保留隐藏的本地文件 `<input ref={localFileInputRef} aria-label="添加本地音乐" .../>`（移到顶栏附近）。
- [ ] 列表 `<main className="content"><div className="track-list" aria-label="歌曲列表">{visibleTracks.map(...)}</div></main>`，行结构沿用上轮（playing-bars/track-bullet + 标题/歌手 + badge）；空态 `<div className="empty-state">…{query ? '没有匹配的歌曲' : '还没有歌曲'}</div>`。
- [ ] 底部 `<footer className="player-bar">`：
```tsx
<footer className="player-bar glass-panel">
  <section className="now-playing" aria-label="当前播放">
    <div className="now-playing-meta">
      <h2>{currentTrack.title}</h2>
      <span>{getTrackSubtitle(currentTrack)}{getTrackBadge(currentTrack) ? ` · ${getTrackBadge(currentTrack)}` : ''}</span>
    </div>
    <button aria-label={currentTrack.liked ? '取消喜欢当前歌曲' : '喜欢当前歌曲'} className={currentTrack.liked ? 'mini-like active' : 'mini-like'} onClick={toggleCurrentTrackLike}>
      <Heart size={18} fill={currentTrack.liked ? 'currentColor' : 'none'} />
    </button>
  </section>
  <div className="progress-area">
    <span>{formatPlaybackTime(playbackTime.current)}</span>
    <input aria-label="播放进度" className="progress-slider" max={playbackTime.duration} min="0" type="range" value={Math.floor(playbackTime.current)} onChange={(e) => handleSeekChange(Number(e.target.value))} />
    <span>{formatPlaybackTime(playbackTime.duration)}</span>
  </div>
  <div className="transport">
    <button aria-label={`播放模式：${playbackModeCopy[playbackMode]}`} className={playbackMode === 'queue' ? '' : 'mode-active'} onClick={cyclePlaybackMode}><ModeIcon size={18} /></button>
    <button aria-label="上一首" onClick={() => moveInQueue('previous')}><SkipBack size={18} fill="currentColor" /></button>
    <button className="play-button" aria-label={isPlaying ? '暂停' : '播放'} onClick={togglePlayback}>{isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
    <button aria-label="下一首" onClick={skipToNextTrack}><SkipForward size={18} fill="currentColor" /></button>
    <button aria-label="更多操作" className={isPlayerMenuOpen ? 'track-menu-btn active' : 'track-menu-btn'} onClick={() => setIsPlayerMenuOpen((o) => !o)}><MoreHorizontal size={18} /></button>
    {isPlayerMenuOpen ? (
      <>
        <div className="menu-scrim" aria-hidden="true" onClick={() => setIsPlayerMenuOpen(false)} />
        <div className="track-menu glass-panel" role="menu">
          <div className="menu-volume">
            <button aria-label={volume > 0 ? '静音' : '取消静音'} onClick={toggleMute}>{volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
            <input aria-label="音量" type="range" min="0" max="100" value={volume} onChange={(e) => handleVolumeChange(Number(e.target.value))} />
          </div>
          <button aria-label={`睡眠定时：${sleepTimerLabel}`} onClick={() => { cycleSleepTimer(); }}>睡眠定时：{sleepTimerLabel}</button>
          {canRemoveCurrentLocalTrack ? <button aria-label="移出本地音乐" onClick={() => { void removeCurrentLocalTrack(); setIsPlayerMenuOpen(false); }}>移出本地音乐</button> : null}
          {canRevealCurrentLocalTrack ? <button aria-label="在访达中显示" onClick={() => { void revealCurrentLocalTrack(); setIsPlayerMenuOpen(false); }}>在访达中显示</button> : null}
        </div>
      </>
    ) : null}
  </div>
  <audio ref={audioRef} src={currentTrack.audioUrl} .../>
</footer>
```
  删原播放队列抽屉 `{isQueueOpen ? ...}` 整块；保留找歌抽屉 `{isFinderOpen ? ...}`。
- [ ] `npm run typecheck` 转绿（清理所有残留未用 import：`ListMusic`/`ListPlus`/`ListMinus`/`Sparkles`/`Radio`/`Library`/`Heart` 视情况，`TrackArtwork` 若列表/播放条都无封面则删）。
- [ ] Commit（App.tsx 结构）。

## Task 4: CSS 单列布局 + 顶栏/菜单/底部样式 + 删死样式
**Files:** `src/styles/global.css`
- [ ] `.app-shell`：`grid-template-columns: 1fr; grid-template-rows: auto auto minmax(0,1fr) auto;`（顶栏/搜索条/列表/播放区）或用 flex 列。保留 `.app-backdrop`、扁平背景。
- [ ] 新增：`.topbar` 单行（标题 + 菜单按钮）、`.app-title`、`.lib-menu-btn`、`.lib-menu`/`.menu-scrim`、`.search-bar`、`.now-playing`（底部居中）、`.menu-volume`、底部 `.track-menu` 复用。
- [ ] 列表行 `.track-row`、`.player-bar`（改纵向 stack：now-playing / progress / transport）、`.progress-slider` 全宽。
- [ ] 删死样式：`.sidebar`/`.brand`/`.nav-*`/`.playlist-*`/`.finder-entry`(若移除)、`.queue-drawer*`/`.queue-toggle`/`.queue-scrim`/`.queue-now`、`.hero-*`/`.feature-grid`/`.music-card`/`.workbench-grid`/`.library-note`/`.library-subtitle`/`.player-focus`/`.focus-*`/`.up-next`/`.queue-chip`/`.cover-chip`/`.window-controls`/`.window-dot`。
- [ ] `npm run build` 通过（CSS 合法）。
- [ ] Commit。

## Task 5: 测试重写
**Files:** `src/App.test.tsx`
- [ ] 删除所有视图/歌单/推荐/队列用例：导航渲染、视图切换、playlist（今日循环/新建/加入/移出/相似/最近）、queue drawer、recommendation、up-next、当前播放面板专属。
- [ ] 改保留功能用例适配新结构：
  - 播放 transport：当前播放 heading（底部 `当前播放` 区）仍可断言。
  - 搜索：先开顶栏「菜单」→点「搜索」→输入过滤；断言不匹配项消失。
  - 导入本地：先开「菜单」→「导入本地音乐」（aria-label `添加本地音乐` input 仍可直接 fireEvent.change 测试）。
  - 在线找歌：先开「菜单」→「在线找歌」→搜索下载。
  - 喜欢：底部 `喜欢当前歌曲`。
  - 移出本地/访达：先开底部 `更多操作` 菜单。
  - 封面背景、媒体会话、键盘快捷键、持久化（当前曲/音量/模式）保留。
- [ ] 新增断言：`queryByText('发现')`/`queryByText('今日循环')` 不存在；唯一 `歌曲列表` 含全部曲目。
- [ ] `npm test` 全绿。
- [ ] Commit。

## Task 6: 验证收尾
- [ ] `npm run build` + `npm test` 全绿。
- [ ] 浏览器/Electron 竖屏截图：单列、顶栏菜单、底部控件、切歌变色、resize 无重叠。
- [ ] README 更新（去掉歌单/视图描述）。Commit。

## Self-Review
- Spec 覆盖：窗口(T1)、删视图歌单队列(T2)、单列渲染(T3)、CSS(T4)、测试(T5)、收尾(T6) 全覆盖。
- 占位符：无。
- 一致性：`isLibraryMenuOpen`/`isSearchOpen`/`isPlayerMenuOpen`/`visibleTracks`/`playbackQueue=visibleTracks`/aria-label（`菜单`/`更多操作`/`当前播放`/`歌曲列表`）前后一致。
- 保留 domain 函数不删；like 仅作标记。
