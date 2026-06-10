# 设计：单屏手机竖屏式极简播放器

- 日期：2026-06-10
- 状态：已与用户确认，待转实现
- 关联：在 `2026-06-10-minimal-cover-immersive-ui-design.md` 之上继续极简化

## 背景与目标

用户要求进一步极简：**去掉整个左侧栏**（导航/歌单/品牌），**不分来源/视图**（本质都是本地的），只保留**一个手机竖屏式的极简播放界面**。窗口本身改成竖屏比例。封面驱动整窗沉浸色（随切歌变化）保留。

## 设计

### 1. 窗口（electron/main.cjs）
默认窗口改竖屏：`width: 420, height: 820, minWidth: 360, minHeight: 620`。其余创建逻辑不变。

### 2. 布局（单列纵向，三段）
`.app-shell` 从「侧栏列 + 3 行」改为**单列**，行：`auto(顶栏) / minmax(0,1fr)(列表) / auto(底部播放区)`。删除整个 `<aside className="sidebar">`。

- **顶栏**：左 `汽水音乐` 标题；右一个菜单按钮（aria-label `菜单`）。点开「库菜单」含三项：
  - **搜索**：点击在顶栏下方展开/聚焦搜索输入框（再点或 Esc 收起）。
  - **导入本地音乐**：触发现有 `handleLocalImportClick`。
  - **在线找歌**：打开现有找歌抽屉 `finder`。
- **中部列表**：**一个统一歌曲列表**，渲染 `filterTracks(tracks, query)`（全部曲目，无视图过滤）。行：歌名 · 歌手 · 标记，点击播放、双击立即播。`aria-label="歌曲列表"`。
- **底部播放区**：
  - 当前曲：歌名（heading）+ 歌手（居中），旁一个喜欢按钮。`aria-label="当前播放"`。
  - 进度行：当前时间 · 进度滑块 · 总时间。
  - 控件行：播放模式（顺序/单曲/随机循环切换）· 上一首 · 播放/暂停 · 下一首 · `⋯`（aria-label `更多操作`）。
  - 底部 `⋯` 菜单：音量（横滑块）、睡眠定时、（本地曲）移出本地音乐、在访达中显示。
- **封面驱动整窗沉浸背景**（`--app-cover` + `.app-backdrop`）保留不变。

### 3. 删除
- 整个侧边栏：品牌、主导航（发现/曲库/本地/喜欢）、歌单区、侧栏底部找歌入口。
- **视图系统**：`activeView`/`setActiveView`、`LibraryView`/`navItems`/`viewCopy`/`viewKicker`/`viewFilters`、`activeCopy`/`activeKicker`/`emptyState.canResolve` 等。
- **全部歌单**：`initialPlaylists`/`restorePlaylists`/`persistPlaylists`/`playlistState`、系统/自建歌单、`isPlaylistView`/`isUserPlaylistView`、`createUserPlaylistFromCurrentTrack`/`addCurrentTrackToActiveUserPlaylist`/`removeCurrentTrackFromActiveUserPlaylist`/`addCurrentTrackToTodayLoop`。
- **推荐/相似/最近**：`playMoreSimilar`、`recentTracks`、相关 UI。
- **播放队列抽屉**：`isQueueOpen`/`queue-drawer`/`queue-toggle`/`queue-scrim` 及 `playbackQueue` 抽屉渲染（playbackQueue 逻辑改为基于可见列表，见下）。
- 底部 ⋯ 中原歌单/相似项移除。

### 4. 保留
- 播放：play/pause、上/下一首、播放模式（顺序/单曲/随机）、睡眠定时、音量/静音、进度、喜欢（仅作标记持久化）。
- 本地导入、在线找歌（抽屉不变）、移出本地/访达显示（本地曲，移入底部 ⋯）。
- 媒体键 / 系统媒体中心、键盘快捷键、状态持久化（当前曲、音量、播放模式、喜欢、播放统计）。
- 封面：本地曲经 `readLocalArtwork` 补封面；当前封面驱动背景。

### 5. 播放队列语义
`playbackQueue` 改为 = 当前可见列表 `filterTracks(tracks, query)`（无搜索时即全部）。`getAdjacentTrackId`/随机/单曲循环仍在其上工作。无独立队列抽屉。

## 组件 / 文件

| 文件 | 改动 |
|---|---|
| `electron/main.cjs` | 窗口默认尺寸改竖屏 |
| `src/App.tsx` | 删侧栏/视图/歌单/推荐/队列；单列布局；顶栏库菜单（搜索/导入/找歌）；底部播放区 + ⋯ 菜单 |
| `src/styles/global.css` | `.app-shell` 单列；顶栏/库菜单/底部播放区/底部 ⋯ 菜单样式；删侧栏/视图/歌单/队列死样式 |
| `src/App.test.tsx` | 删视图/歌单/推荐/队列用例；改保留功能用例（搜索/播放/喜欢/导入/找歌/本地操作/持久化/媒体会话）适配新结构 |
| `electron/main-window.test.ts` | 窗口尺寸断言（如有）按需更新 |

> domain 的 `buildRecommendationCards`/`buildSimilarTrackIds`/`parseLrc`/`createResolverJob`/`getResolverSummary` 保留（domain 测试覆盖），UI 不再用。

## 数据流
```
tracks ──filterTracks(query)──> visibleTracks
  ├─ 渲染为唯一列表
  └─ 作为 playbackQueue（next/prev/shuffle 基于它）
currentTrack.coverUrl ──> --app-cover ──> .app-backdrop（整窗色，随切歌变）
顶栏菜单：搜索(toggle 输入框) / 导入 / 在线找歌
底部 ⋯：音量 / 睡眠 / (本地)移出·访达
```

## 测试（Vitest + Testing Library）
- 不再渲染侧栏/导航/歌单：`queryByText('发现'|'曲库'|'今日循环'|'播放列表')` 不存在。
- 唯一列表渲染全部曲目；搜索过滤生效。
- 顶栏菜单可开，点「搜索」展开搜索框、「导入」触发选择、「在线找歌」打开抽屉。
- 底部：上/下/播放、模式切换、喜欢标记持久化；⋯ 菜单可开并触发音量/睡眠/移出本地/访达。
- 封面驱动 `--app-cover` 仍随切歌更新（保留原断言）。
- 媒体会话、键盘快捷键、当前曲/音量/模式持久化保留。
- 全量 `npm run typecheck` + `npm test` + `npm run build` 通过。

## 不在本次范围（YAGNI）
- 喜欢的独立视图/筛选（喜欢只作标记持久化；无 favorites 列表）。
- 歌单/推荐/队列任何形式回归。
- 真·移动端触控适配（仅桌面竖屏窗口观感）。
