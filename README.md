# TeaMusic 🎵

一个用 **Electron + Vite + React + TypeScript** 打造的独立桌面音乐播放器，**手机竖屏式单屏极简**界面，风格取自汽水音乐。纯听歌产品 —— 不分来源、没有社交/会员/商城等任何无关功能。

> 独立桌面软件，**不在浏览器中运行**。竖屏窗口（420×820）。生产模式下 Electron 主进程离线加载本地打包产物。

## ✨ 功能

- **单屏极简**：顶栏（标题 + 一个菜单）+ 一个统一歌曲列表 + 底部纵向播放区，无侧栏、无视图切换、无歌单、无歌词、无卡片
- **封面驱动整窗沉浸色**：整体 UI 背景由**当前歌曲封面**模糊派生，随切歌实时变化（汽水音乐精髓）
- **统一曲库**：在线、已补全、本地音乐都在同一个列表里（本质都是本地的）
- **顶栏菜单**：搜索、导入本地音乐、在线找歌，都收进一个菜单，保持界面干净
- **本地音乐**：拖拽 / 文件选择导入，读取同名封面，`本地` 标记
- **在线找歌**：菜单进入独立面板，精准搜索并逐首下载真实音频，自动入库（`已补全` 标记）
- **播放控制**：上一首/播放/下一首、顺序/单曲循环/随机、进度、喜欢；音量/睡眠定时/本地操作收进底部 `⋯` 菜单
- **桌面体验**：媒体键 / 系统媒体中心、键盘快捷键、状态持久化

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
  App.tsx            应用主组件（单屏壳、统一列表、播放器、顶栏/底部菜单、在线找歌）
  domain/music.ts    纯领域逻辑（曲目模型、标记、解析、播放队列、LRC）
  styles/global.css  玻璃材质设计系统与全部视图样式
docs/superpowers/    产品设计 spec 与实现计划
```

## 📝 说明

本项目是个人技术学习性质的界面/交互复刻，**不内置汽水音乐的 Logo、图标与曲库内容**；示例数据为原创占位内容。在线找歌能力为个人学习用途，已内置于应用（`electron/fangpi-source.cjs`），不再依赖外部脚本。
