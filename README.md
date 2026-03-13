# Notepad

一款面向 macOS 的轻量级本地笔记应用，使用 Electron + React + Tailwind CSS 构建，数据通过 SQLite 持久化存储在本地。

## 功能特性

- **富文本编辑** — 基于 Tiptap 的所见即所得编辑器，支持标题、列表、引用、图片等
- **分类管理** — 全部笔记、今天、重要、归档四个内置分类
- **快速搜索** — 按标题和正文内容实时筛选笔记
- **自动保存** — 编辑后自动延迟保存到本地 SQLite 数据库
- **macOS 原生风格** — 无边框透明窗口、圆角毛玻璃侧边栏、系统红绿灯按钮

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Electron |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 样式方案 | Tailwind CSS 3 |
| 富文本编辑 | Tiptap (ProseMirror) |
| 数据存储 | SQLite (系统 `sqlite3` CLI) |
| 打包工具 | electron-builder |

## 项目结构

```
notepad/
├── electron/
│   ├── main.js          # Electron 主进程（窗口管理、数据库、IPC）
│   └── preload.js       # 预加载脚本，暴露 notepad API 到渲染进程
├── src/
│   ├── main.tsx         # React 入口
│   ├── App.tsx          # 应用主组件（侧边栏、笔记列表、编辑器）
│   ├── index.css        # 全局样式
│   ├── vite-env.d.ts    # 类型声明
│   ├── components/
│   │   ├── TiptapEditor.tsx    # Tiptap 富文本编辑器组件
│   │   └── WysiwygEditor.tsx   # 编辑器备选实现
│   └── utils/
│       └── html.ts      # HTML 处理工具函数
└── package.json
```

## 快速开始

### 前置要求

- Node.js >= 18
- macOS（依赖系统自带的 `sqlite3` 命令行工具）

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

同时启动 Vite 开发服务器和 Electron 窗口，支持热更新。

### 构建与打包

```bash
# 仅构建前端资源
npm run build

# 打包为 macOS 应用（输出到 release/ 目录）
npm run dist
```

## 许可证

[MIT](LICENSE)
