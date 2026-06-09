# TeaMusic 🎵

一个用 **Electron + Vite + React + TypeScript** 打造的独立桌面音乐播放器，界面与交互复刻自汽水音乐风格。纯听歌产品 —— 只有播放、曲库、推荐与本地音乐，没有社交、会员、商城等任何无关功能。

> 独立桌面软件，**不在浏览器中运行**。生产模式下 Electron 主进程离线加载本地打包产物。

## ✨ 功能

- **统一曲库**：在线、已补全、本地音乐放进同一个播放队列
- **沉浸式播放页**：封面派生的动态模糊背景、播放时大封面旋转、大字同步歌词自动滚动高亮、完整传输控件
- **播放队列抽屉**：从底部播放条唤出，列出完整队列、高亮正在播放、点击即播
- **本地音乐**：拖拽 / 文件选择导入，读取同名 LRC 歌词与封面，`本地` 标记
- **显式下载**：在线曲目一键下载真实音频（经 musicol 后端），`下载中 → 已下载` 状态
- **后台曲库补全**：搜索缺失歌曲时静默补全，完成后自动回到曲库（`已补全` 标记）
- **推荐**：每日推荐、场景电台、热歌榜、同频推荐 —— 随播放/喜欢/导入/补全实时更新
- **歌单**：今日循环、深夜不跳歌、相似推荐、最近播放，支持自建歌单
- **播放控制**：顺序/单曲循环/随机、睡眠定时、音量、进度、喜欢
- **桌面体验**：macOS 隐藏标题栏 + 原生 vibrancy、媒体键 / 系统媒体中心、键盘快捷键、状态持久化

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

# 启动独立 Electron 窗口（dev server + 桌面壳）
npm run dev:mac      # 另开一个终端，在 npm run dev 起来后执行

# 构建生产包并以独立窗口运行
npm run start:mac
```

> 国内拉取 Electron 二进制慢时，可设镜像：
> `export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`

## ✅ 质量

```bash
npm run typecheck    # tsc --noEmit
npm test             # 全量单元 / 组件测试
npm run build        # 类型检查 + 生产构建
```

## 📁 结构

```
electron/            Electron 主进程、preload、本地音乐库与下载器桥接
  main.cjs           窗口创建、IPC、本地库持久化、musicol 下载子进程
  preload.cjs        contextBridge 暴露给渲染层的安全 API
  music-library.cjs  音频扫描、LRC / 封面读取
src/
  App.tsx            应用主组件（壳、播放器、播放页、队列、下载、推荐）
  domain/music.ts    纯领域逻辑（曲目模型、标记、解析、推荐打分、LRC）
  styles/global.css  玻璃材质设计系统与全部视图样式
docs/superpowers/    产品设计 spec 与实现计划
```

## 📝 说明

本项目是个人技术学习性质的界面/交互复刻，**不内置汽水音乐的 Logo、图标与曲库内容**；示例数据为原创占位内容。下载能力依赖外部 `musicol` 后端脚本。
