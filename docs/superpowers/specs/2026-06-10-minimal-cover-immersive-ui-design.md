# 设计：精简列表式 UI + 封面驱动整窗沉浸色

- 日期：2026-06-10
- 状态：已与用户确认，待转实现
- 关联：在 `2026-06-10-online-search-download-design.md` 之上继续

## 背景与目标

当前 UI 过于"花哨"，且 resize 时布局重叠。用户要求：把整个 app 直接简化成**列表式播放器**（参照主流播放器），只留必要控件与界面，**不要分类卡片、不要歌曲卡片、不要歌词、不要沉浸式播放页**；但**封面必须保留且是核心**——汽水音乐的精髓是**整体 UI 色彩随当前歌曲封面切换而变化**，本设计采用这一点。不做模式切换，直接简化（无"完整/精简"开关）。

## 现状关键事实（已核实）

- **resize 重叠根因**：`.app-shell` 行高固定 `48px / 1fr / 78px`。在 `@media (max-width: 980px)` 把 `.player-bar` 改成 `grid-template-columns: 1fr`，三块（now-playing/transport/progress-area）竖排堆叠，但播放条行仍死锁 78px（加高到 134px 要 ≤760px 才生效）→ 760–980px 区间播放条溢出盖住内容。
- **封面→颜色机制**：沉浸页根节点设 `style={{ '--np-cover': url(coverUrl) }}`（`App.tsx:1759`），`.np-backdrop`（`global.css:1074`）用它做 `filter: blur(80px) saturate(180%) brightness(0.6)` 的模糊背景。目前**只在沉浸页生效**。
- `.app-shell` 当前背景是静态多重径向渐变（`global.css:40`），与封面无关。
- 封面渲染统一走 `TrackArtwork`（`App.tsx:461`）：有 `coverUrl` 渲染 `<img>`，否则渲染渐变占位 chip。

## 设计

### 1. 封面驱动整窗沉浸色（核心，新增）

把"模糊封面背景"从沉浸页**上移到 `.app-shell` 级**：

- `App.tsx` 根 `.app-shell` 节点加内联样式：`style={currentTrack.coverUrl ? ({ '--app-cover': \`url("${currentTrack.coverUrl}")\` } as CSSProperties) : undefined}`。
- 新增首子元素 `<div aria-hidden className="app-backdrop" />`，绝对定位铺满，`background-image: var(--app-cover)`、`blur(80px) saturate(180%) brightness(0.55)`、轻微放大，叠一层暗色 radial/linear 渐变保证前景可读。
- `.app-shell` 原静态多重径向渐变背景替换为一个**干净的扁平深色兜底**（无封面时显示）。
- 切歌时 `currentTrack.coverUrl` 变化 → 变量变 → 背景平滑过渡（给 `.app-backdrop` 加 `transition: background-image`/`opacity`，或用透明度淡入）。

> 列表行**默认不放行内封面**（保持列表清爽，按用户选定的 mockup）。封面的视觉/色彩通过整窗背景 + 播放条缩略图体现。播放条保留 `album-art` 缩略图。

### 2. 删除（无关 / 不够精简）

- **歌词全部**：内容区 `lyrics-window`、沉浸页 `np-lyrics`、`currentLyrics`/`currentLyricIndex`、点歌词跳转、`readLocalLyrics` 拉取 effect、`parseLrc` 在 UI 的使用。
- **沉浸式播放页** `now-playing-page` 整块（大封面旋转 `np-cover spinning` + 歌词 + np-topbar/np-stage）、`isNowPlayingOpen` 状态、打开/关闭/Esc 处理、播放条上"打开沉浸页"的 `album-art-button`/`album-art-open`。
- **卡片类**：`feature-grid`（场景电台/榜单/分类卡）、`music-card`、`RecommendationCard` 渲染、`openRecommendation`、`recommendationCards`、顶部 `hero-row` 推荐文案/标题。
- **`player-focus`** 当前播放大面板（含 `focus-cover` + 歌词预览）。
- `.app-shell` 花哨多重径向渐变（被封面背景取代）。

### 3. 保留（必要的控件与界面）

- 侧边导航 `nav-list`（发现/曲库/本地/喜欢）+ `playlist-section` 歌单 + 在线找歌入口 `finder-entry`。
- 顶部 `topbar` 搜索框。
- **纯歌曲列表** `歌曲列表`：每行 歌名 · 歌手 · 标记（`getTrackBadge`），无行内封面、无封面 chip。
- 底部 `player-bar`：`album-art` 封面缩略图 + 歌名/歌手文字 + 传输（⏮▶⏭ + 模式 + 睡眠定时）+ 进度 + 音量 + 喜欢。
- 本地导入（`添加本地音乐`）、在线找歌抽屉、播放队列抽屉（队列行去封面 chip，纯文字）。
- 媒体键 / 系统媒体中心、键盘快捷键、状态持久化等非视觉能力不变。

### 4. 修复 resize 重叠

- `.player-bar` **始终单行横排**：用能优雅收缩的列定义（如 `minmax(0, 1fr) auto minmax(0, 1fr)`，进度区 `min-width:0` 可压缩，音量在窄屏可隐藏），移除 980px 把它改成 `1fr` 竖排的规则。
- `.app-shell` 底部行高从死锁 `78px` 改为 `auto`（或 `minmax(64px, auto)`），播放条按内容定高，永不溢出盖住内容。
- 重写/精简 `@media (max-width: 980px)` 与 `760px`：窄屏下隐藏次要元素（音量滑块、进度时间），而非堆叠换行导致重叠。

## 组件 / 文件

| 文件 | 改动 |
|---|---|
| `src/App.tsx` | 根挂 `--app-cover` + `.app-backdrop`；内容区改纯列表；删沉浸页/卡片/歌词/player-focus 及相关状态与处理；播放条去"打开沉浸页"按钮（保留 album-art 缩略图） |
| `src/styles/global.css` | 新增 `.app-backdrop`；`.app-shell` 背景扁平化；删 now-playing-page/player-focus/feature-grid/music-card/lyrics 等样式；重写 player-bar 与断点修 resize |
| `src/App.test.tsx` | 删/改沉浸页、歌词、推荐卡片、封面 chip 相关用例；加"切歌时 `--app-cover` 变化""无沉浸页/无歌词/无卡片"断言 |
| `src/domain/music.ts` | 不删 `buildRecommendationCards`/`parseLrc`/`buildSimilarTrackIds`（仍被 domain 测试覆盖；UI 不再用）。仅移除 App.tsx 的 import |

## 数据流

```
currentTrack 变化（切歌/选歌）
  → currentTrack.coverUrl
  → .app-shell style 变量 --app-cover
  → .app-backdrop 模糊封面背景重绘（带过渡）
  → 整窗沉浸色随之切换
```
封面来源不变：种子曲目自带 `coverUrl`；本地曲目经 `readLocalArtwork` 补封面；在线下载曲目暂无封面（落 `TrackArtwork` 渐变占位，背景退回扁平兜底）。

## 测试（Vitest + Testing Library）

- 切歌后根节点 `--app-cover` 变量包含新封面 url（或 `.app-backdrop` 的 style 反映当前封面）。
- 无封面曲目时不报错、回退兜底背景。
- 断言已移除：`now-playing-page`、`np-lyrics`/歌词窗、`feature-grid`/`music-card`/推荐卡、`player-focus`、列表行 `cover-chip` 不再出现。
- 列表仍渲染（歌名/歌手/标记）、播放条 `album-art` 仍在、搜索/导入/找歌/队列仍可用。
- resize：播放条结构在窄宽下不产生竖排堆叠（无 `1fr` 单列规则）；`.app-shell` 底部行 `auto`。
- 全量 `npm run typecheck` + `npm test` + `npm run build` 通过。

## 不在本次范围（YAGNI）

- 从封面**提取主色**做精确 tint（用模糊封面本身即可，不引入 canvas 取色库）。
- 列表行内小封面（默认不加；用户后续可要求）。
- 完整/精简双模式切换（用户明确不要切换）。
- 移动端/极窄宽专门适配（仅保证常规桌面 resize 不重叠）。
