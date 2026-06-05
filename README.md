# Raro · 智能设备控制小程序

微信小程序，用于 ESP32-C3 设备的 BLE 配网、语音控制与实时监控。基于 Taro 4.x + React 18 + TypeScript + Tailwind CSS 4 开发。

> v1.0.0 · RakTec / Xra AIoT 平台子项目

## 功能概览

### BLE 设备配网
- 扫描附近 ESP32-C3 蓝牙设备
- 通过 BLE 写入 WiFi 配置（JSON 格式）
- 三步流程：扫描 → 配置 → 结果
- 30 秒超时保护，自动重连（最多 3 次）

### 控制中心
- WebSocket 实时连接 go-kernel 后端
- 设备列表与在线状态管理
- 快捷动作面板（招手、摇头、点头、跳舞、开门、关门、前进、后退、急停）
- 自然语言指令输入，经认知路由 → PA-HPS 调度 → gRPC → MQTT 管线执行
- 实时事件流（ASR 识别、语音回复、动作执行、错误）
- PA-HPS 三级优先队列调度器监控

### 调试控制台
- 实时日志查看器（INFO/DEBUG/WARN/ERROR 级别过滤）
- 配网状态监控
- 日志导出（复制到剪贴板）
- 内嵌使用教程与 BLE UUID 速查

## 快速开始

```bash
# 安装依赖
pnpm i

# 启动开发（微信小程序）
pnpm dev:weapp

# 构建发布
pnpm build:weapp
```

用微信开发者工具打开 `dist/` 目录即可预览。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Taro 4.x + React 18 |
| 语言 | TypeScript 5.x |
| 样式 | Tailwind CSS 4 + weapp-tailwindcss |
| 状态管理 | 简易 pub/sub store + MobX (dashboard) |
| 包管理 | pnpm |
| 目标平台 | 微信小程序 |

## 项目结构

```
src/
├── app.tsx                 # 应用入口（Class Component）
├── app.config.ts           # 应用配置（页面路由 + TabBar）
├── app.css                 # 全局样式
├── pages/
│   ├── index/              # 设备扫描页（入口页）
│   ├── dashboard/          # 控制中心（TabBar: 控制）
│   ├── provision/          # 设备配网（TabBar: 配网）
│   └── debug/              # 调试控制台（TabBar: 日志）
├── services/
│   ├── ble.ts              # BLE 蓝牙服务（事件驱动）
│   ├── ws.ts               # WebSocket 实时事件服务
│   └── kernel.ts           # go-kernel HTTP API 客户端
├── store/
│   ├── simple.ts           # 简易 pub/sub 状态管理
│   ├── dashboard.ts        # 控制中心 MobX store
│   ├── provisioning.ts     # 配网 MobX store（遗留，未使用）
│   └── index.ts            # Store 统一导出
├── utils/
│   ├── parser.ts           # BLE 数据编解码工具
│   └── logger.ts           # 内存日志缓冲（pub/sub）
└── assets/                 # TabBar 图标等静态资源
```

## 系统架构

```
微信小程序 (rak-app)
    ↓ BLE (WiFi 配网)
ESP32-C3 设备
    ↓ MQTT
go-kernel (:8080) ← WebSocket 实时事件 + HTTP API
    ↓ gRPC
rak-runtime (:50051) → 语音识别 / LLM 推理
```

## BLE 协议

| 特征值 | UUID | 用途 |
|--------|------|------|
| Service | `0000fff0-0000-1000-8000-00805f9b34fb` | 主服务 |
| Write | `0000fff1-...` | 发送 WiFi 配置 |
| Notify | `0000fff2-...` | 接收配网结果 |
| Read | `0000fff3-...` | 读取设备状态 |

数据格式：JSON 字符串编码为 ArrayBuffer。

## App ID

- 微信：`wxdae9ce011aac5fb1`
