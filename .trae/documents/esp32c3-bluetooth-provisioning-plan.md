# ESP32-C3 蓝牙配网小程序计划

## 项目概述

使用 Taro + MobX + TypeScript + TailwindCSS 开发微信小程序，实现对 ESP32-C3 的蓝牙配网功能。同时提供 Python 模拟脚本用于测试。

## 技术栈

* **小程序端**: Taro 4.1.9 + React + MobX + TypeScript + TailwindCSS

* **模拟脚本**: Python + uv

## 系统架构

```
┌─────────────────┐     BLE      ┌─────────────────┐
│  微信小程序      │ <──────────> │  ESP32-C3        │
│  (Taro)         │              │  (Arduino/IDF)   │
└─────────────────┘              └─────────────────┘
        │                                │
        │                                │
        ▼                                ▼
┌─────────────────┐              ┌─────────────────┐
│  蓝牙BLE API    │              │  WiFi 连接      │
│  wx.openBLE     │              │  配网存储        │
│  wx.createBLE   │              └─────────────────┘
└─────────────────┘
```

## 配网协议设计

### BLE 服务和特征值

```
Service UUID: 0000fff0-0000-1000-8000-00805f9b34fb
├── Characteristic (Write): 0000fff1-...  // 写入WiFi配置
├── Characteristic (Notify): 0000fff2-... // 接收配网结果
└── Characteristic (Read): 0000fff3-...   // 读取设备状态
```

### 配网数据格式

```json
{
  "type": "wifi_config",
  "ssid": "WiFi名称",
  "password": "WiFi密码",
  "timestamp": 1234567890
}
```

### 响应数据格式

```json
{
  "type": "config_result",
  "status": "success|failed",
  "ip": "192.168.1.100",
  "message": "连接成功"
}
```

## 实现步骤

### 第一阶段：小程序端开发

#### 1. 创建 BLE 管理服务

**文件**: `src/services/ble.ts`

* 初始化蓝牙适配器

* 搜索附近设备

* 建立 BLE 连接

* 发现服务和特征值

* 数据读写操作

* 断开连接管理

#### 2. 创建配网状态管理 (MobX Store)

**文件**: `src/store/provisioning.ts`

* 设备列表状态

* 连接状态

* 配网进度状态

* 错误信息状态

* WiFi 配置信息

#### 3. 创建 UI 组件

##### 3.1 扫描设备页面

**文件**: `src/pages/index/index.tsx`

* 扫描按钮

* 设备列表展示

* 设备信号强度显示

* 点击连接设备

##### 3.2 WiFi 配置页面

**文件**: `src/pages/config/index.tsx`

* WiFi 名称输入

* WiFi 密码输入

* 显示已保存的网络

* 提交配置按钮

##### 3.3 配网进度页面

**文件**: `src/pages/progress/index.tsx`

* 连接状态显示

* 配网进度条

* 成功/失败提示

* 重试按钮

##### 3.4 Debug 控制台页面

**文件**: `src/pages/debug/index.tsx`

* 实时日志显示

* BLE 数据包详情

* 通信历史记录

* 导出日志功能

#### 4. 路由配置

**文件**: `src/app.config.ts`

* 添加所有页面路径

* 配置 tabBar（首页、配置、调试）

#### 5. 创建教程页面

**文件**: `src/pages/tutorial/index.tsx`

* 配网流程说明

* 常见问题解答

* 硬件连接指南

* 视频教程链接

### 第二阶段：ESP32-C3 固件开发

#### 1. Arduino 框架固件

**目录**: `firmware/esp32c3-ble-provisioning/`

* `main.cpp` - 主程序

* `ble_server.h/cpp` - BLE 服务实现

* `wifi_manager.h/cpp` - WiFi 管理

* `config_storage.h/cpp` - 配置存储

#### 2. BLE 服务实现

* 创建 GATT 服务

* 注册特征值

* 处理写入事件

* 发送通知

#### 3. WiFi 配网逻辑

* 接收配置数据

* 尝试连接 WiFi

* 返回连接结果

* 保存配置到 NVS

### 第三阶段：Python 模拟脚本

#### 1. BLE 模拟脚本

**文件**: `test/ble_provisioning_simulator.py`

* 使用 `bleak` 库模拟 BLE 设备

* 创建 GATT 服务

* 处理配网请求

* 返回模拟结果

#### 2. 测试工具

**文件**: `test/test_provisioning.py`

* 自动化测试脚本

* 测试配网流程

* 验证数据格式

#### 3. 依赖配置

**文件**: `test/pyproject.toml`

* 添加 `bleak` 依赖

* 添加 `asyncio` 依赖

## 详细代码结构

```
rak/
├── src/
│   ├── services/
│   │   └── ble.ts              # BLE 蓝牙服务
│   ├── store/
│   │   ├── index.ts            # Store 入口
│   │   └── provisioning.ts     # 配网状态管理
│   ├── pages/
│   │   ├── index/              # 扫描设备页
│   │   │   ├── index.tsx
│   │   │   ├── index.config.ts
│   │   │   └── index.css
│   │   ├── config/             # WiFi 配置页
│   │   │   ├── index.tsx
│   │   │   ├── index.config.ts
│   │   │   └── index.css
│   │   ├── progress/           # 配网进度页
│   │   │   ├── index.tsx
│   │   │   ├── index.config.ts
│   │   │   └── index.css
│   │   ├── debug/              # Debug 控制台
│   │   │   ├── index.tsx
│   │   │   ├── index.config.ts
│   │   │   └── index.css
│   │   └── tutorial/           # 教程页面
│   │       ├── index.tsx
│   │       ├── index.config.ts
│   │       └── index.css
│   ├── components/
│   │   ├── DeviceItem.tsx      # 设备列表项
│   │   ├── LogViewer.tsx       # 日志查看器
│   │   └── StatusBadge.tsx     # 状态徽章
│   ├── utils/
│   │   ├── logger.ts           # 日志工具
│   │   └── parser.ts           # 数据解析
│   ├── app.tsx
│   ├── app.config.ts
│   └── app.css
├── firmware/
│   └── esp32c3-ble-provisioning/
│       ├── platformio.ini
│       └── src/
│           ├── main.cpp
│           ├── ble_server.h
│           ├── ble_server.cpp
│           ├── wifi_manager.h
│           ├── wifi_manager.cpp
│           ├── config_storage.h
│           └── config_storage.cpp
└── test/
    ├── pyproject.toml
    ├── main.py
    ├── ble_provisioning_simulator.py
    └── test_provisioning.py
```

## 蓝牙配网流程

```
┌─────────────────────────────────────────────────────────────┐
│                        配网流程                              │
├─────────────────────────────────────────────────────────────┤
│  1. 小程序启动蓝牙扫描                                       │
│     ↓                                                        │
│  2. 发现 ESP32-C3 设备 (名称: ESP32C3-Provision)            │
│     ↓                                                        │
│  3. 建立 BLE 连接                                            │
│     ↓                                                        │
│  4. 发现服务和特征值                                         │
│     ↓                                                        │
│  5. 用户输入 WiFi 信息                                       │
│     ↓                                                        │
│  6. 发送 WiFi 配置到设备 (Write Characteristic)              │
│     ↓                                                        │
│  7. ESP32-C3 接收配置并尝试连接 WiFi                         │
│     ↓                                                        │
│  8. 设备通过 Notify 返回连接结果                             │
│     ↓                                                        │
│  9. 小程序显示配网结果                                       │
│     ↓                                                        │
│  10. 断开 BLE 连接                                           │
└─────────────────────────────────────────────────────────────┘
```

## Debug 功能设计

### 日志级别

* **INFO**: 一般信息

* **DEBUG**: 调试信息

* **WARN**: 警告信息

* **ERROR**: 错误信息

### 日志内容

* BLE 连接事件

* 数据发送/接收

* 配网状态变化

* 错误堆栈

### 数据包展示

* 原始数据 (HEX)

* 解析后数据 (JSON)

* 时间戳

* 方向 (发送/接收)

## 依赖更新

### package.json

无需额外依赖，使用 Taro 内置的蓝牙 API

### test/pyproject.toml

```toml
[project]
dependencies = [
    "bleak>=0.21.0",
    "asyncio>=3.4.3",
]
```

## 实现顺序

1. ✅ 创建 BLE 服务 (`src/services/ble.ts`)
2. ✅ 创建配网 Store (`src/store/provisioning.ts`)
3. ✅ 更新路由配置 (`src/app.config.ts`)
4. ✅ 实现扫描设备页面
5. ✅ 实现 WiFi 配置页面
6. ✅ 实现配网进度页面
7. ✅ 实现 Debug 控制台
8. ✅ 实现教程页面
9. ✅ 创建公共组件
10. ✅ 编写 Python 模拟脚本
11. ✅ 编写 ESP32-C3 固件代码
12. ✅ 测试和调试

## 验证标准

* [ ] 小程序能成功扫描到模拟的 BLE 设备

* [ ] 能建立 BLE 连接并发现服务

* [ ] 能发送 WiFi 配置数据

* [ ] 能接收配网结果通知

* [ ] Debug 控制台能显示完整日志

* [ ] Python 模拟能完整响应配网流程

* [ ] 教程页面内容完整清晰

