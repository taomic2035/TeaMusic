# TeaMusic 🎵

一个用 **Electron + Vite + React + TypeScript** 打造的独立桌面音乐播放器，**精简列表式**界面，风格取自汽水音乐。纯听歌产品 —— 只有播放、曲库与本地音乐，没有社交、会员、商城等任何无关功能。

> 独立桌面软件，**不在浏览器中运行**。生产模式下 Electron 主进程离线加载本地打包产物。

## ✨ 功能

- **简洁界面**：左侧导航 + 中间纯歌曲列表 + 底部播放条，只留必要控件，无分类卡片、无歌词、无沉浸页
- **封面驱动整窗沉浸色**：整体 UI 背景由**当前歌曲封面**模糊派生，随切歌实时变化（汽水音乐精髓）
- **统一曲库**：在线、已补全、本地音乐放进同一个播放队列
- **播放队列抽屉**：从底部播放条唤出，列出完整队列、高亮正在播放、点击即播
- **本地音乐**：拖拽 / 文件选择导入，读取同名封面，`本地` 标记
- **在线找歌（隐藏入口）**：侧边栏底部低调入口打开独立面板，精准搜索并逐首下载真实音频，自动入库（`已补全` 标记）。下载能力刻意收纳
- **歌单**：今日循环、深夜不跳歌、相似推荐、最近播放，支持自建歌单（当前曲操作收进底部 `⋯` 菜单）
- **播放控制**：顺序/单曲循环/随机、睡眠定时、音量、进度、喜欢
- **桌面体验**：媒体键 / 系统媒体中心、键盘快捷键、状态持久化、窗口自适应（resize 不重叠）

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Electron（contextIsolation + preload 安全隔离） |
| 构建 | Vite（`base: './'` 适配 `file://` 离线加载） |
| UI | React 19 + TypeScript |
| 图标 | lucide-react |
| 测试 | Vitest + Testing Library |

## 🚀 开发

```bash
npm install

# Web 调试（仅用于快速看 UI，非最终形态）
npm run dev

# 构建生产包并以独立窗口运行（跨平台，Win/Mac 通用）
npm start
```

> 国内拉取 Electron 二进制慢或失败时，先设镜像再装二进制：
> - PowerShell：`$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; node node_modules/electron/install.js`
> - bash：`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node node_modules/electron/install.js`

## ✅ 质量

```bash
npm run typecheck    # tsc --noEmit
npm test             # 全量单元 / 组件测试
npm run build        # 类型检查 + 生产构建
```

## 📁 结构

```
electron/            Electron 主进程、preload、本地音乐库与在线下载引擎
  main.cjs           窗口创建、IPC、本地库持久化、在线搜索/下载接线
  preload.cjs        contextBridge 暴露给渲染层的安全 API
  fangpi-source.cjs  进程内在线找歌引擎（搜索列表、取流、下载，纯 Node 内置、可单测）
  music-library.cjs  音频扫描、LRC / 封面读取
src/
  App.tsx            应用主组件（壳、播放器、播放页、队列、下载、推荐）
  domain/music.ts    纯领域逻辑（曲目模型、标记、解析、推荐打分、LRC）
  styles/global.css  玻璃材质设计系统与全部视图样式
docs/superpowers/    产品设计 spec 与实现计划
```

## 📝 说明

本项目是个人技术学习性质的界面/交互复刻，**不内置汽水音乐的 Logo、图标与曲库内容**；示例数据为原创占位内容。在线找歌能力为个人学习用途，已内置于应用（`electron/fangpi-source.cjs`），不再依赖外部脚本。
