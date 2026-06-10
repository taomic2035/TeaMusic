# 设计：隐藏式在线找歌与下载（扩充曲库核心）

- 日期：2026-06-10
- 状态：已与用户确认，待转实现
- 目标平台：Windows 11（此前在 macOS 验证过）

## 背景与问题

TeaMusic 的曲库目前只有 `src/App.tsx` 里 3 首硬编码种子曲（`initialTracks`），真实内容要靠下载/导入填充。"扩充曲库"本质上就是"让下载真正能用"。当前下载链路完全失效，根因有三：

1. **Win11 路径阻塞**：`electron/main.cjs` 把下载器硬编码成 macOS 路径 `/Users/taomic/musicol/downloader.js`，本机（`D:\vibecoding\musicol`）找不到，点下载直接抛错。
2. **下载源接口过期**：下载器抓取的 `fangpi.net` 已把取流接口从 `POST /api/play-url` 改为 `POST /member/common-play-url`（参数 `{id: play_id}`、响应结构 `{code:1,data:{url}}` 不变）。旧脚本打错端点，全站下载失败。
3. **搜索是黑盒**：主搜索只过滤本地 3 首；搜不到时**静默**下载第 1 个结果，用户看不到候选、也无法选择——与"精准搜索"诉求相反。

此外发现一个**致命的 Win11 兼容 bug**：`src/domain/music.ts` 的 `toFileAudioUrl` 生成 `file://D:/...`（两斜杠），Chromium 会把 `D:` 当主机名，导致本地/下载歌曲在 Win11 **无法播放**。`electron/music-library.cjs` 的 `toFileUrl`（封面）同样问题。不修则下载完也播不了。

## 已验证的事实（实测，2026-06-10）

- fangpi 搜索正常：`晴天` 返回 40 首，解析准确。
- 改用 `POST /member/common-play-url {id: play_id}` 后，无验证码即返回 `code:1` + 真实 MP3 地址（kuwo CDN，128kbps）。
- 该地址实测可直连下载：`HTTP 206`、`content-type: audio/mpeg`、magic bytes `49 44 33`（ID3）= 真 MP3。
- Cloudflare Turnstile 为**有条件触发**（`appData.should_verify`），常规请求不弹；触发时无法自动求解。

## 用户确认的约束

- **核心范围**：精准搜索 + 下载。榜单/批量/爬流行歌等"输入源"留给以后的独立模块。
- **界面隐藏**：在线搜索/下载属于规避版权的能力，**不能放在显眼位置**，须经**独立菜单点击**才出现；主界面保持简洁纯净。
- **架构**：把抓取逻辑**吸收进 app 的 electron 进程内模块**（非 spawn 外部脚本）。

## 架构

### 新增进程内模块 `electron/fangpi-source.cjs`

零 npm 依赖、纯 Node 内置（`https`/`http`/`fs`/`path`/`url`），可被 Vitest 单测。导出：

| 函数 | 签名 | 职责 |
|---|---|---|
| `searchSongs` | `(keyword: string) => Promise<Array<{id, title, artist}>>` | 触发搜索缓存 → 取 `/s/<kw>` HTML → 解析去重列表。**只列表，不下载、不取流。** |
| `resolvePlayUrl` | `(musicId: string) => Promise<{title, artist, url, mp3Type}>` | 取 `/music/<id>` → **安全解析** `appData`（见下，不用 `eval`）→ `POST /member/common-play-url` → 返回真实 MP3 地址；`antiserver.kuwo.cn` 链接做 `convert_url3` 转换。VIP（`mp3_type===1`）/ `should_verify` / `code!==1` 抛带中文原因的错误。 |
| `downloadSong` | `(musicId: string, outDir: string) => Promise<{filePath, title, artist}>` | 调 `resolvePlayUrl` + 流式下载到 `outDir/<sanitize(歌手)>/<sanitize(歌名-歌手)>.mp3`，`.tmp` 落地后 rename（跨盘 fallback 复制），已存在则跳过。 |

**安全解析 appData（替代 eval）**：页面含 `window.appData = JSON.parse('<JS 转义字符串>');`。用正则捕获单引号内内容 `S`，将其作为 JSON 字符串字面量二次解码：`JSON.parse(JSON.parse('"' + S.replace(/"/g,'\\"').replace(/\\'/g,"'") + '"'))`，得到对象。该路径有专门单测覆盖（含真实样例片段）。

**常量**：`BASE='https://www.fangpi.net'`、Windows UA、请求超时、下载超时、礼貌延迟。下载二进制时**不带 Referer**（kuwo CDN 会拒绝来自 fangpi 的请求）。

### `electron/main.cjs` 改动

- 删除 `MUSICOL_DIR`/`DOWNLOADER_PATH` 常量、`spawn` 子进程逻辑、`musicol:resolve` / `musicol:scan-resolved` 中与外部脚本耦合的部分。
- 新增 IPC：
  - `fangpi:search` `(query) => searchSongs(query)`
  - `fangpi:download` `(musicId) =>` 在 `~/Music/TeaMusic/Resolved` 下 `downloadSong`，返回新文件路径（或 `{error}`）。
- 保留 `musicol:scan-resolved`（改为只扫 `Resolved` 目录，不再依赖外部脚本）、`musicol:scan-local`、本地导入/移除/揭示、读歌词/封面等。

### `electron/preload.cjs` + `src/types/electron.d.ts`

`teaMusicBackend` 新增：
- `searchOnline(query: string): Promise<Array<{id; title; artist}>>`
- `downloadOnline(musicId: string): Promise<{filePath; title; artist} | {error: string}>`

移除 `resolveMissingTrack`（旧静默下载路径）。

### 渲染层 `src/App.tsx`

- **新增隐藏面板状态**：`isFinderOpen`、`finderQuery`、`finderResults`、`finderLoading`、`finderError`，复用现有 `downloadingIds`。
- **隐藏入口**：侧边栏（`aside.sidebar`）底部加一个低调小图标按钮，点击 `setIsFinderOpen(true)`。
- **在线找歌抽屉**：参照现有 `queue-drawer` 的玻璃面板样式，含独立搜索框、候选列表（歌名 + 歌手）、每行下载按钮（复用 `下载中 → 已下载` 视觉）。下载成功后：把文件经 `createResolvedTrackFromPath` + `mergeTracksById` 并入 `tracks`，可立即播放；失败则该行按钮复位并显示克制的内联错误。
- **主搜索回归本分**：移除 `queueResolverJob` / `autoResolve` 等静默下载逻辑与 `autoResolveDelayMs`；回车不再触发下载，只过滤本地。
- **移除播放条迷你下载按钮**（`currentTrack.source === 'catalog'` 分支）及其相关样式钩子。

### Win11 文件 URL 修复（必须）

`toFileAudioUrl`（`src/domain/music.ts`）与 `toFileUrl`（`electron/music-library.cjs`）统一为：
```
const fwd = filePath.replace(/\\/g, '/');
const url = fwd.startsWith('/') ? `file://${fwd}` : `file:///${fwd}`;
return encodeURI(url);
```
兼容 macOS（`/Users/..`→`file:///Users/..`）与 Windows（`D:/..`→`file:///D:/..`）。

## 数据流

```
[隐藏面板] 输入关键词 + 回车提交触发搜索（按回车才请求，避免每键打源、对 fangpi 礼貌）
   → IPC fangpi:search → searchSongs() → 候选列表渲染
[隐藏面板] 点某首「下载」
   → IPC fangpi:download → downloadSong(id, ~/Music/TeaMusic/Resolved)
   → 返回 filePath
   → createResolvedTrackFromPath + mergeTracksById → 并入曲库（resolved 标记）
   → 立即可播；下次启动经 scanResolvedLibrary 从磁盘恢复
```

## 错误处理

- `searchSongs`：网络失败/0 结果 → 返回空数组 + 面板显示"没找到，换个关键词"。
- `resolvePlayUrl`/`downloadSong`：VIP / `should_verify`（验证码）/ `code!==1` / 下载中断 → 抛带中文原因错误；IPC 捕获为 `{error}`；面板该行复位并内联提示（如"这首暂时下不了，换一首"）。**不静默吞错**（修正旧版子进程 exit 0 仍算失败的问题）。
- 礼貌限速：列表内多次请求间保留延迟；下载单首即时。

## 测试（Vitest）

- `electron/fangpi-source.test.ts`：
  - `parseSongList` 解析固定 HTML 片段 → 正确 `{id,title,artist}` 去重。
  - appData 安全解析：对含转义（`\'`、`\\`、`\uXXXX`、`-`）的真实样例片段，结果与预期对象一致；确认**不调用 eval**。
  - `resolvePlayUrl` 对各错误响应（VIP / code≠1 / should_verify）抛清晰错误（用注入的 fetch/http stub）。
  - 文件名 `sanitize` 去非法字符、限长。
- `src/domain/music.test.ts`：`toFileAudioUrl` 新增 Windows 盘符与 POSIX 两种用例 → 均产出三斜杠 `file:///`。
- `electron/music-library.test.ts`：`toFileUrl` 同上 Windows 用例。
- `src/App.test.tsx`：隐藏入口点击打开面板；下载成功并入曲库；主搜索不再触发任何下载。
- 全量 `npm run typecheck` 与 `npm test` 通过。

## 影响文件清单

| 文件 | 改动 |
|---|---|
| `electron/fangpi-source.cjs` | 新增（抓取/取流/下载引擎） |
| `electron/fangpi-source.test.ts` | 新增（单测） |
| `electron/main.cjs` | 删 spawn/硬编码路径；加 `fangpi:search`/`fangpi:download` |
| `electron/preload.cjs` | 暴露 `searchOnline`/`downloadOnline`，移除 `resolveMissingTrack` |
| `src/types/electron.d.ts` | 同步类型 |
| `src/App.tsx` | 隐藏入口 + 在线找歌抽屉；移除静默下载与迷你下载按钮 |
| `src/domain/music.ts` | `toFileAudioUrl` 三斜杠修复 |
| `electron/music-library.cjs` | `toFileUrl` 三斜杠修复 |
| `src/styles/global.css` | 隐藏入口图标 + 找歌抽屉样式 |
| `D:\vibecoding\musicol\downloader.js`（外部） | 顺手修端点，独立 CLI 可用；TeaMusic 不依赖 |

## 不在本次范围（YAGNI）

- 排行榜 / 批量 / 爬流行歌（未来独立"输入源"模块）。
- 下载封面（`appData.mp3_cover`）与歌词（fast-follow）。
- Turnstile 自动求解（不绕验证码）。
- 打包/分发配置。
