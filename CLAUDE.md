# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Raro** — a WeChat Mini Program for provisioning ESP32-C3 devices with WiFi credentials over BLE. Built on Taro 4.x + React 18 + TypeScript + Tailwind CSS 4. Documentation and comments are primarily in Chinese (中文).

This is a sub-project of the RakTec/Xra AIoT platform. The companion firmware lives in `rak-esp/` (not in this repo). The global BLE/MQTT protocol spec is in a separate `RakTec/` repo.

## Commands

```bash
pnpm install              # Install dependencies
pnpm dev:weapp            # Dev server for WeChat Mini Program (open dist/ in WeChat DevTools)
pnpm build:weapp          # Production build
```

Other platform targets exist (`dev:h5`, `dev:alipay`, `dev:tt`, etc.) but WeChat (`weapp`) is the primary target. No `lint` script is defined — ESLint runs via `eslint-config-taro` during build.

### Python BLE Tests

```bash
cd test
python -m unittest test_provisioning.py   # Run BLE protocol tests
```

Requires Python 3.11+ and `bleak>=0.21.0`.

## Architecture

### Data Flow

```
BLE Service (services/ble.ts)
    ↕ event emitter (on/off/emit)
Simple Store (store/simple.ts)  ← pub/sub state management
    ↕ subscribe/notify pattern
4 Pages (pages/index, config, debug, tutorial)
    ↕
Parser (utils/parser.ts) + Logger (utils/logger.ts)
```

### State Management

**Two stores exist, but only one is actively used:**

- `store/simple.ts` — Plain pub/sub store (no MobX). This is the store imported by all pages. Uses `subscribe()`/`notify()` pattern. Replaced MobX to avoid WeChat Mini Program compatibility issues.
- `store/provisioning.ts` — MobX 4.x store with `@observable`/`@action` decorators. Contains BLE listener integration but is **not currently imported by any page**. Kept as reference for future migration.

Pages do **not** use `@inject` or `@observer` decorators — they import `simpleStore` directly.

### Key Singletons

All core services are **singletons** exported from their modules:

- `bleService` (`services/ble.ts`) — wraps Taro BLE APIs with custom event emitter (`Map<string, callback[]>`). Events: `adapterStateChange`, `scanStateChange`, `deviceFound`, `connectionStateChange`, `dataSent`, `dataReceived`, `error`
- `simpleStore` (`store/simple.ts`) — global state with pub/sub notifications
- `logger` (`utils/logger.ts`) — in-memory log buffer with pub/sub listeners

### BLE Protocol

Single service UUID `0000fff0-0000-1000-8000-00805f9b34fb` with three characteristics:

| Characteristic | UUID (last segment) | Purpose |
|---|---|---|
| Write | `fff1` | Send WiFi config to device |
| Notify | `fff2` | Receive config results from device |
| Read | `fff3` | Read device status |

Data format: JSON strings encoded as ArrayBuffer (see `utils/parser.ts`). Message types are discriminated by a `type` field: `wifi_config`, `config_result`, `device_status`.

Note: `arrayBufferToString`, `stringToArrayBuffer`, `arrayBufferToHex` are duplicated in both `services/ble.ts` (static methods) and `utils/parser.ts`. **Always import from `utils/parser`**, not from `ble.ts` static methods.

### Provisioning State Machine

`provisioningState` transitions: `idle` → `scanning` → `connecting` → `connected` → `configuring` → `success` | `failed`

The store has a 30-second timeout on `sendWiFiConfig()` — if no `config_result` arrives, it transitions to `failed`.

### Pages (Tab Bar)

1. **index** — BLE device scan + list. Connects to device, then navigates to config.
2. **config** — WiFi SSID/password input. Sends config via BLE write. Redirects to index if no device selected.
3. **debug** — Real-time log viewer with level filtering. Shows provisioning status and config results.
4. **tutorial** — Expandable FAQ + protocol docs. Reference only (no store usage).

**Important**: Pages MUST be class components (not functional components). No hooks allowed.

Each page lives in `src/pages/<name>/` with this structure:
```
src/pages/<name>/
├── index.tsx        # Class component
├── index.css        # Supplementary CSS (must import)
└── index.config.ts  # Page config (navigationBarTitleText)
```

## Build Configuration

- Design width: 750 (Taro default)
- Webpack persistent cache: disabled
- Production builds: ESBuild drops `console`/`debugger`, Terser as fallback
- `lazyCodeLoading: 'requiredComponents'` enabled in production
- `weapp-tailwindcss` transforms Tailwind classes with `rem2rpx: true`

## Conventions

- 2-space indentation (`.editorconfig`)
- `experimentalDecorators: true` in tsconfig — required for MobX decorators (used in `store/provisioning.ts`)
- `strictNullChecks: true`, `noUnusedLocals: true`, `noUnusedParameters: true`
- ESLint extends `taro/react`; React 17+ JSX transform (no need for `import React`)
- Build output goes to `dist/` (referenced in `project.config.json` as mini program root)
- App ID: `wxdae9ce011aac5fb1` (WeChat), also `project.tt.json` for TikTok mini program
- `noImplicitAny: false` — lenient typing is intentional
- Conditional classes: use template literals `` className={`${condition ? 'class-a' : 'class-b'}`} ``

### Git Workflow

- Pull before work: Always `git pull` at session start
- Commit frequently: After each logical unit (bug fix, feature, refactor)
- Keep commits atomic: One concern per commit
