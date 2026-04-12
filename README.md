<div align="center">

<img src="frontend/public/favicon.svg" width="80" height="80" alt="ClawOS" />

# ClawOS

### 你的私有云桌面，运行在浏览器里

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

一个自托管的 Web 桌面系统，在浏览器中提供接近原生桌面的操作体验。  
AI 炒股分析、影音娱乐、文件管理、笔记、RSS 资讯 —— 一站式整合。

**[> English Docs](README_EN.md)**

<img src=".github/screenshot.png" width="960" alt="ClawOS Desktop Screenshot" />

</div>

---

## 为什么选 ClawOS？

大多数自托管面板只是给你一个书签网格。ClawOS 给你一个**真正的桌面** —— 可拖拽窗口、macOS 风格 Dock、桌面小组件、壁纸、15 个互相联动的内置应用。

它只为**一个人**设计：你自己。单用户、单机部署、零云端依赖。通过 Tailscale 或任何 VPN 远程访问，一切开箱即用。

### 核心亮点

- **完整桌面壳层** —— Dock 栏、窗口管理、壁纸系统、通知中心、系统状态栏
- **AI 智能炒股** —— A 股行情信号、多专家模型投票、持仓风控、记忆复盘
- **影音中心** —— 网易云在线播放、本地音乐库、影视搜索 + HLS 播放
- **效率工具** —— Markdown 笔记（富文本编辑器）、滴答清单集成、RSS 每日简报
- **文件与网盘** —— FileBrowser 本地文件管理、百度 / 夸克网盘（AList 挂载）
- **系统监控** —— CPU/内存/磁盘/网络实时 Widget、systemd 服务健康面板
- **下载管理** —— Aria2 引擎驱动，速度显示 + 队列管理

## 架构

```
浏览器 ──> ClawOS (:3001)
             ├── 静态前端 (React SPA)
             ├── REST API (/api/system/*)
             ├── 反向代理 ──> OpenClaw AI   (:18789)
             ├── 反向代理 ──> FileBrowser    (:18790)
             └── RPC 调用 ──> Aria2          (:6800)
                           ──> AList          (:5244)
```

| 层级 | 技术栈 |
|---|---|
| **前端** | React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + Zustand + Framer Motion |
| **后端** | Node.js + Express 5 + TypeScript + Winston 日志 |
| **编辑器** | Tiptap（富文本笔记编辑器） |
| **集成服务** | OpenClaw、FileBrowser、AList、Aria2、网易云音乐 API、AKShare (Python) |

## 快速开始

### 系统要求

- **操作系统**：Linux（推荐 Ubuntu 24.04+）
- **Node.js**：20+
- **Python 3**：AI 炒股数据采集需要（AKShare）
- **可选**：Tailscale、Aria2、AList、FileBrowser、OpenClaw

### 1. 克隆 & 安装

```bash
git clone https://github.com/gumustudio/ClawOS.git
cd ClawOS
npm install --prefix frontend
npm install --prefix backend
```

### 2. 配置

```bash
# 设置登录密码（Basic Auth，用户名固定为 clawos）
mkdir -p ~/.clawos
echo "CLAWOS_PASSWORD=你的密码" > ~/.clawos/.env
```

### 3. 构建 & 运行

```bash
# 构建前后端
./scripts/build.sh

# 开发模式（热重载）
./scripts/start-dev.sh
# 前端: http://localhost:5173
# 后端: http://localhost:3001

# 生产模式（systemd 常驻服务）
./scripts/install-systemd.sh
# 访问: http://localhost:3001
```

## 内置应用

| 应用 | 说明 |
|---|---|
| **AI 炒股** | A 股行情信号、多模型专家投票、持仓管理、风控预警、记忆复盘 |
| **系统状态** | CPU/内存/磁盘/网络实时监控，以桌面 Widget 形式展示 |
| **服务监控** | 所有 systemd 服务的健康状态面板 |
| **OpenClaw** | 通过反向代理嵌入 AI 网关（零侵入原项目） |
| **文件总管** | FileBrowser 集成，管理本机文件 |
| **影视仓** | MacCMS 片源搜索 + HLS 在线播放 |
| **网易云** | 网易云音乐在线播放，支持 VIP Cookie |
| **本地音乐** | 本机音乐扫描、播放、歌词显示 |
| **下载管理** | 基于 Aria2 RPC 的下载任务管理 |
| **随手小记** | 本地 Markdown 笔记，支持文件夹、富文本编辑、图片插入 |
| **滴答清单 lite** | 滴答清单 OAuth 集成，任务管理 + 日历视图 |
| **每日简报** | 本地 RSS 资讯导入、去重、分类、简报生成 |
| **计划任务** | 后端定时任务的可视化管理面板 |
| **百度 / 夸克网盘** | 通过 AList 代理挂载浏览和下载 |

## 桌面特性

- **窗口管理** —— macOS 风格窗口，红/黄/绿按钮（关闭/最小化/最大化），可切换窗口/全屏
- **Dock 栏** —— 自动隐藏、可调大小（32–80px）、悬停动画、运行中应用指示器
- **桌面小组件** —— 滴答待办（支持自然语言创建任务）、时钟日历、系统资源、下载队列、正在播放
- **通知中心** —— 后端持久化通知 + SSE 实时推送 + Toast 提醒
- **壁纸系统** —— 多壁纸可选，打开应用时自动模糊效果
- **系统设置** —— 个性化、下载路径、账号授权、系统信息

## 配置说明

### 环境变量

| 变量 | 来源 | 说明 |
|---|---|---|
| `CLAWOS_PASSWORD` | `~/.clawos/.env` | 登录密码（用户名固定为 `clawos`） |
| `OPENCLAW_GATEWAY_TOKEN` | `~/.openclaw/.env` | OpenClaw 网关认证 token |
| `PORT` | 环境变量 | 后端监听端口（默认 `3001`） |
| `DIDA_CLIENT_ID` / `DIDA_CLIENT_SECRET` | 环境变量 | 滴答清单 OAuth 凭据 |
| `BAIDU_NETDISK_CLIENT_ID` / `BAIDU_NETDISK_CLIENT_SECRET` | 环境变量 | 百度网盘 OAuth 凭据 |

### 路径配置

所有工作目录可通过设置界面或 `~/.clawos/config.json` 修改：

```json
{
  "paths": {
    "downloadsDir": "~/下载",
    "musicDownloadsDir": "~/音乐",
    "notesDir": "~/文档/随手小记",
    "readerDir": "~/文档/RSS资讯",
    "stockAnalysisDir": "~/文档/AI炒股分析",
    "videoDownloadsDir": "~/视频"
  }
}
```

## 鉴权机制

- 所有路由受 **HTTP Basic Auth** 保护（用户名：`clawos`）
- 前端内置登录页面
- FileBrowser 代理使用二次 Cookie 鉴权（`clawos_filebrowser_auth`）
- 本地音乐流媒体使用 Cookie 鉴权（`clawos_media_auth`），因为 `<audio>` 标签无法携带 Auth 头
- 不设置 `CLAWOS_PASSWORD` 则跳过鉴权（仅限本地开发）

## 外部服务

所有外部服务**均为可选**，不安装不影响核心桌面和其他应用。

| 服务 | 端口 | 用途 |
|---|---|---|
| Aria2 | 6800 | 下载引擎 |
| AList | 5244 | 网盘挂载（百度/夸克） |
| FileBrowser | 18790 | 本地文件管理 UI |
| OpenClaw | 18789 | AI 对话网关 |

## systemd 服务

`install-systemd.sh` 安装以下 user-level 服务：

| 服务 | 说明 |
|---|---|
| `clawos.service` | 主后端服务（Node.js） |
| `clawos-filebrowser.service` | FileBrowser 实例 |
| `clawos-watchdog.timer` | 每 10 分钟健康巡检，异常自动重启 |
| `clawos-display-inhibit.service` | 防休眠保活（远程访问时防黑屏） |

## 测试

```bash
# 后端测试
npm --prefix backend test

# 前端测试
npm --prefix frontend test

# 仅类型检查
npx --prefix frontend tsc --noEmit
npx --prefix backend tsc --noEmit
```

## 目录结构

```
ClawOS/
├── frontend/           # React 前端
│   ├── src/
│   │   ├── apps/       # 各应用组件（AIQuant、Notes、Music 等）
│   │   ├── components/ # 通用组件（通知中心、Dock、桌面 Widget）
│   │   ├── store/      # Zustand 全局状态
│   │   ├── lib/        # 工具库（通知 SDK、服务端配置）
│   │   └── App.tsx     # 桌面壳层 + 应用注册
│   └── public/         # 静态资源（壁纸、图标）
├── backend/
│   ├── src/
│   │   ├── routes/     # Express 路由
│   │   ├── services/   # 业务逻辑（AI 炒股、资讯、通知）
│   │   ├── utils/      # 工具模块（配置、日志、探针）
│   │   └── server.ts   # 入口：鉴权、代理、静态托管
│   └── tests/          # 后端测试
├── scripts/            # 构建、部署、systemd 安装脚本
└── filebrowser/        # FileBrowser 相关文件
```

## 常见问题

**不装 Aria2/AList/OpenClaw 能用吗？**  
可以。这些都是可选集成，对应功能会显示为不可用状态，其他一切正常。

**怎么远程访问？**  
后端默认绑定 `127.0.0.1:3001`，不暴露外网。推荐通过 Tailscale、WireGuard 或反向代理访问。

**怎么更新？**  
```bash
git pull
./scripts/build.sh
systemctl --user restart clawos.service
```

## 开源协议

本项目基于 [GNU General Public License v3.0](LICENSE) 开源。

<div align="center">

---

由 [gumustudio](https://github.com/gumustudio) 用心构建

</div>
