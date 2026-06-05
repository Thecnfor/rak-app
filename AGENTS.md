# AGENTS.md

Raro 微信小程序的编码规范与约束。

## 技术栈

- **框架**：Taro 4.x + React 18 + TypeScript
- **样式**：Tailwind CSS 4（`@tailwindcss/postcss` + `weapp-tailwindcss`）
- **状态管理**：简易 pub/sub store（`store/simple.ts`）+ MobX（`store/dashboard.ts`，仅控制中心使用）
- **包管理**：pnpm
- **目标平台**：微信小程序（`weapp`）

## 组件规范

**页面必须使用 Class 组件**，禁止函数组件和 Hooks：

```typescript
import { Component, PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'

interface PageState {
  // 本地状态定义
}

export default class PageName extends Component<PropsWithChildren, PageState> {
  state: PageState = { /* 初始值 */ }

  componentDidMount() { /* 初始化 */ }
  componentWillUnmount() { /* 清理 */ }

  render() {
    return <View>...</View>
  }
}
```

每个页面定义本地 `interface XxxState`。

## 状态管理

### 简易 Store（主用）

```typescript
import { store } from '../../store/simple'
```

- 读取：`store.selectedDevice`、`store.provisioningState`
- 写入：`store.setDevice(...)`、`store.setConnectionState(...)`
- 纯 pub/sub 模式，无 MobX 装饰器

### Dashboard Store（控制中心专用）

```typescript
import { dashboardStore } from '../../store/dashboard'
```

- 使用 MobX `@observable` / `@action` 装饰器
- 管理：设备列表、WebSocket 状态、实时事件、调度器统计、自然语言指令
- 仅 `pages/dashboard` 引用

## 服务架构

### BLE 服务

```typescript
import { bleService } from '../../services/ble'

// componentDidMount 中注册
this.handleData = (data) => { /* ... */ }
bleService.on('dataReceived', this.handleData)

// componentWillUnmount 中必须清理
bleService.off('dataReceived', this.handleData)
```

事件：`adapterStateChange`、`scanStateChange`、`deviceFound`、`connectionStateChange`、`dataSent`、`dataReceived`、`error`

特性：自动重连（3 次，2 秒间隔）、连接超时（10 秒）、MTU 协商（512）

### WebSocket 服务

```typescript
import { wsService } from '../../services/ws'
```

- 连接 go-kernel 实时事件流
- 事件：`connected`、`disconnected`、`asr`、`voice_reply`、`action`、`chain_error`、`state`、`message`
- 自动重连（3 秒间隔）

### Kernel API 客户端

```typescript
import { getDevices, executeTask, executeAction, getSchedulerStats } from '../../services/kernel'
```

- HTTP 请求封装（Taro.request）
- API：`getDevices`、`getDevice`、`executeTask`、`executeAction`、`routeNL`、`getSchedulerStats`、`getHealth`
- 自动 trace_id 生成，遵循 RakMessage v0 协议

## 样式规范

使用 Tailwind 工具类：

```tsx
<View className="min-h-screen bg-[#FAF8F5] p-4">
  <Text className="text-lg font-bold text-[#1A1A1A]">标题</Text>
</View>
```

Tailwind 无法覆盖的 CSS（动画、伪选择器）写在页面的 `index.css` 中：

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

每个页面必须 `import './index.css'`。

## 文件结构

每个页面在 `src/pages/<name>/` 下：

```
src/pages/<name>/
├── index.tsx        # Class 组件
├── index.css        # 补充 CSS
└── index.config.ts  # 页面配置（navigationBarTitleText）
```

页面配置：

```typescript
import { definePageConfig } from '@tarojs/taro'

export default definePageConfig({
  navigationBarTitleText: '页面标题'
})
```

## TabBar 页面

| Tab | 页面路径 | 标题 | 功能 |
|-----|---------|------|------|
| 控制 | `pages/dashboard/index` | 控制中心 | 设备管理、快捷动作、NL 指令、实时事件、调度器监控 |
| 配网 | `pages/provision/index` | 设备配网 | BLE 扫描 → WiFi 配置 → 结果 |
| 日志 | `pages/debug/index` | 调试控制台 | 实时日志、状态监控、使用教程 |

入口页 `pages/index/index`（设备扫描）不在 TabBar 中，仅作为启动页。

## 导入规范

```typescript
// Taro 组件
import { View, Text, Button, Input, ScrollView } from '@tarojs/components'

// Taro API
import Taro from '@tarojs/taro'

// 工具函数 — 从 utils/parser 导入，不要从 ble.ts 静态方法导入
import { encodeWiFiConfig, decodeBLEMessage, arrayBufferToHex } from '../../utils/parser'

// 日志
import { logger } from '../../utils/logger'
```

## TypeScript 配置

- `strictNullChecks: true` — 必须处理空值
- `noImplicitAny: false` — 允许 `any`
- `noUnusedLocals: true`、`noUnusedParameters: true`
- `jsx: "react-jsx"` — 无需 `import React`
- `experimentalDecorators: true` — MobX 装饰器支持

## 编码约定

- 2 空格缩进
- 所有服务/Store 都是单例，不要创建新实例
- 条件类名：`` className={`${condition ? 'class-a' : 'class-b'}`} ``
- 配色方案：主色 `#1A1A1A`、背景 `#FAF8F5`、边框 `#E5E2DD`、成功 `#2D7D46`、错误 `#C0392B`

## Git 工作流

- **先 pull**：每次会话开始先 `git pull`
- **频繁提交**：每个逻辑单元（bug 修复、功能、重构）完成后立即提交
- **原子提交**：一个提交只关注一件事
- **提交信息**：使用中文，格式 `<type>: <描述>`（feat/fix/docs/refactor）
