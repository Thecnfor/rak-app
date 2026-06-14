# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**Raro** — 微信小程序，用于 ESP32-C3 设备的 BLE 配网、语音控制与实时监控。基于 Taro 4.x + React 18 + TypeScript + Tailwind CSS 4 开发。文档和注释均为中文。

这是 RakTec / Xra AIoT 平台的子项目。配套固件在 `rak-esp/` 仓库中，中央后端为 `go-kernel`。

**注意**：Taro 配置中 `projectName: "green"`（非 "Raro"），`src/index.html` 标题也是 "green"。

## 常用命令

```bash
pnpm install              # 安装依赖
pnpm dev:weapp            # 微信小程序开发服务器（用微信开发者工具打开 dist/）
pnpm build:weapp          # 生产构建
```

其他平台目标存在（`dev:h5`、`dev:alipay`、`dev:tt` 等），但微信（`weapp`）是主要目标。无 `lint` 脚本 — ESLint 通过 `eslint-config-taro` 在构建时运行。

### BLE 测试

```bash
# Node.js 仿真测试（无需硬件，模拟 ESP32 + 手机两端）
node test/ble-sim.mjs

# Python BLE 协议测试（需 bleak>=0.21.0，Python 3.11+）
cd test && python -m unittest test_provisioning.py

# Python 真实 BLE 测试（需 root 权限，@abandonware/noble）
node test/ble-real.mjs
```

测试文件说明：`test/ble_provisioning_simulator.py` 是 Python 测试的 BLE 模拟器类；`test/pyproject.toml` 定义 Python 项目配置。

## 架构

### 数据流

```
go-kernel (:8080)
    ↓ HTTP API                ↓ WebSocket 实时事件
Kernel 客户端              WSService
(services/kernel.ts)      (services/ws.ts)
    ↓                          ↓
Dashboard Store ──────→ 控制中心页面
(store/dashboard.ts)    (pages/dashboard)
    ↑
Simple Store ─────────→ 配网 / 调试页面
(store/simple.ts)      (pages/provision, debug)
    ↑
BLE Service ←────────→ ESP32-C3 设备
(services/ble.ts)
    ↑
Parser + Logger
(utils/parser.ts, utils/logger.ts)
```

### 状态管理

**三个 Store 并存，各司其职：**

- `store/simple.ts` — 简易 pub/sub Store（无 MobX）。配网和调试页面使用。`subscribe()`/`notify()` 模式。管理：BLE 设备、连接状态、配网状态、WiFi 配置、错误信息。
- `store/dashboard.ts` — MobX Store（`@observable`/`@action`）。控制中心页面使用。管理：设备列表、WebSocket 状态、实时事件流、PA-HPS 调度器统计、自然语言指令执行。
- `store/provisioning.ts` — MobX 配网 Store（**遗留，当前无页面引用**）。保留供未来参考。

页面不使用 `@inject` 或 `@observer` 装饰器 — 直接导入 Store 实例。

### 核心单例

- `bleService`（`services/ble.ts`）— 封装 Taro BLE API，自定义事件发射器（`Map<string, callback[]>`）。事件：`adapterStateChange`、`scanStateChange`、`deviceFound`、`connectionStateChange`、`dataSent`、`dataReceived`、`error`。特性：自动重连（3 次，2 秒间隔）、连接超时（10 秒）、MTU 协商（512）。
- `wsService`（`services/ws.ts`）— go-kernel WebSocket 实时事件服务。事件：`connected`、`disconnected`、`asr`、`voice_reply`、`action`、`chain_error`、`state`、`message`、`device_state`。自动重连（3 秒间隔）。
- `dashboardStore`（`store/dashboard.ts`）— 控制中心 MobX 状态。
- `store`（`store/simple.ts`）— 配网/调试 pub/sub 状态。
- `logger`（`utils/logger.ts`）— 内存日志缓冲，pub/sub 监听器。

### 服务端地址

`services/kernel.ts` 和 `services/ws.ts` 中硬编码了 go-kernel 地址（`116.205.183.125:8080`，即 Hak 服务器）。无环境变量配置，修改需直接改代码。

### Kernel API（`services/kernel.ts`）

HTTP 客户端封装，连接 go-kernel 后端：

| 方法 | 端点 | 说明 |
|------|------|------|
| `getDevices()` | `GET /api/v1/devices` | 获取所有设备列表 |
| `getDevice(id)` | `GET /api/v1/device/:id` | 获取单个设备 |
| `executeTask(input)` | `POST /api/v1/task/execute` | 自然语言任务执行（完整管线） |
| `executeAction(id, action)` | `POST /api/v1/action/execute` | 单动作直接执行 |
| `routeNL(input)` | `POST /api/v1/route` | 认知路由（NL → 任务描述） |
| `getSchedulerStats()` | `GET /api/debug/scheduler` | PA-HPS 调度器统计 |
| `getHealth()` | `GET /api/health` | 健康检查 |

请求自动附加 trace_id，遵循 RakMessage v0 协议。

### BLE 协议

单一 Service UUID `0000fff0-0000-1000-8000-00805f9b34fb`，三个特征值：

| 特征值 | UUID（末段） | 用途 |
|--------|-------------|------|
| Write | `fff1` | 发送 WiFi 配置 |
| Notify | `fff2` | 接收配网结果 |
| Read | `fff3` | 读取设备状态 |

数据格式：JSON 字符串编码为 ArrayBuffer（见 `utils/parser.ts`）。消息类型通过 `type` 字段区分：`wifi_config`、`config_result`、`device_status`。

注意：
- `arrayBufferToString`、`stringToArrayBuffer`、`arrayBufferToHex` 在 `services/ble.ts` 和 `utils/parser.ts` 中有重复。**始终从 `utils/parser` 导入**。
- `BLEDevice` 接口在 `store/simple.ts`（3 字段）和 `services/ble.ts`（4 字段，含 `advertisData`）中有不同定义。
- `BLEConnectionState` 类型在 `services/ble.ts` 含 `'disconnecting'`，而 `store/simple.ts` 中缺少该状态。

### 配网状态机

`provisioningState` 转换：`idle` → `configuring` → `success` | `failed`

Store 有 30 秒超时 — 若未收到 `config_result`，转为 `failed`。

### 页面说明

| 页面 | TabBar | 标题 | 功能 |
|------|--------|------|------|
| `pages/index` | 否 | 设备扫描 | BLE 设备扫描与连接（入口页） |
| `pages/dashboard` | 控制 | 控制中心 | 设备管理、快捷动作、NL 指令、实时事件流、PA-HPS 调度器监控 |
| `pages/provision` | 配网 | 设备配网 | 统一三步配网流程（扫描 → 配置 → 结果） |
| `pages/debug` | 日志 | 调试控制台 | 实时日志查看、配网状态、使用教程 |
| `pages/tutorial` | — | — | **孤立页面**，未注册到 `app.config.ts`，无 `index.config.ts`/`index.css`。内容与 debug 页面教程部分重复。`src/assets/` 中有对应 TabBar 图标（`tab-tutorial.png`），疑似曾计划作为独立 Tab。 |

**重要**：页面必须使用 Class 组件（非函数组件）。禁止 Hooks。

**已知 Bug**：`pages/index/index.tsx` 第 70 行导航到 `/pages/config/index`（不存在），应为 `/pages/provision/index`。

每个页面在 `src/pages/<name>/` 下：
```
src/pages/<name>/
├── index.tsx        # Class 组件
├── index.css        # 补充 CSS（必须导入）
└── index.config.ts  # 页面配置（navigationBarTitleText）
```

### 快捷动作列表

控制中心支持以下快捷动作（通过 go-kernel → MQTT → ESP32 执行）：

| 动作 | 标签 | 图标 |
|------|------|------|
| `wave_hand` | 招手 | 👋 |
| `shake_head` | 摇头 | 🙅 |
| `nod` | 点头 | 🙆 |
| `dance` | 跳舞 | 💃 |
| `lock_open` | 开门 | 🔓 |
| `lock_close` | 关门 | 🔒 |
| `move_forward` | 前进 | ⬆️ |
| `move_back` | 后退 | ⬇️ |
| `emergency_stop` | 急停 | 🛑 |

### 实时事件流

WebSocket 推送的链路事件类型：

- `asr` — ASR 语音识别结果（`text`）
- `voice_reply` — 语音回复（`voiceReply`、`latency`）
- `action` — 动作执行结果（`actions[]`、`priority`、`targetDevice`）
- `error` — 链路错误（`error`）
- `device_state` — 设备状态变更（`deviceId`、`status`）

`dashboard.ts` 中 `ChainEvent.type` 还定义了 `'scheduler'`，但当前无代码触发该类型。

## 构建配置

- 设计宽度：750（Taro 默认）
- Webpack 持久化缓存：已禁用
- 生产构建：ESBuild 移除 `console`/`debugger`，Terser 作为后备
- `lazyCodeLoading: 'requiredComponents'` 生产环境启用
- `weapp-tailwindcss` 转换 Tailwind 类名，`rem2rpx: true`
- 生产构建启用 `componentPlugin`（组件懒注入）、`optimizeMainPackage`（主包优化）、`splitChunks`（vendors + common 策略）
- `image-webpack-loader` 在 Windows 环境已禁用（缺少二进制文件导致 EOF 错误），`sharp` 作为后备
- `tsconfig-paths-webpack-plugin` 用于路径别名解析（tsconfig `baseUrl: "."`）
- Tailwind CSS v4 语法：`src/app.css` 使用 `@import "tailwindcss"`（非 v3 的 `@tailwind` 指令）
- `types/global.d.ts` 提供 Taro 类型引用和图片/样式模块声明

## 编码约定

- 2 空格缩进（`.editorconfig`）
- `experimentalDecorators: true`（tsconfig）— MobX 装饰器所需
- `strictNullChecks: true`、`noUnusedLocals: true`、`noUnusedParameters: true`
- `noImplicitAny: false` — 宽松类型是有意为之
- ESLint 继承 `taro/react`；React 17+ JSX 转换（无需 `import React`）
- 构建输出到 `dist/`（`project.config.json` 中的 `miniprogramRoot`）
- App ID：`wxdae9ce011aac5fb1`（微信），另有 `project.tt.json`（抖音小程序）
- 条件类名：`` className={`${condition ? 'class-a' : 'class-b'}`} ``
- 配色方案：主色 `#1A1A1A`、背景 `#FAF8F5`、边框 `#E5E2DD`、成功 `#2D7D46`、错误 `#C0392B`

### Git 工作流

- 先 pull：每次会话开始先 `git pull`
- 频繁提交：每个逻辑单元完成后立即提交
- 原子提交：一个提交只关注一件事
- 提交信息：中文，格式 `<type>: <描述>`（feat/fix/docs/refactor）

### 伴读文件

- `AGENTS.md` — 编码规范（导入顺序、组件模板、命名约定），与本文件有重叠但包含更多代码模式细节
- `TODO.md` — 维护任务清单：M1（buffer 工具函数去重）、M2（确认 provisioning.ts 可删除）、M3（BLE 连接稳定性测试）
- `pnpm-workspace.yaml` — 原生模块构建配置（sharp、esbuild、weapp-tailwindcss 等）
