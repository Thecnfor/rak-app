# AGENTS.md

Coding conventions and constraints for the Raro WeChat Mini Program.

## Tech Stack

- **Framework**: Taro 4.x + React 18 + TypeScript
- **Styling**: Tailwind CSS 4 (`@tailwindcss/postcss` + `weapp-tailwindcss`)
- **State**: Simple pub/sub store (`store/simple.ts`)
- **Package manager**: pnpm
- **Target**: WeChat Mini Program (`weapp`)

## Component Pattern

Pages MUST be class components:

```typescript
import { Component, PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'

interface PageState {
  // local state shape
}

export default class PageName extends Component<PropsWithChildren, PageState> {
  state: PageState = { /* initial */ }

  componentDidMount() { /* setup */ }
  componentWillUnmount() { /* cleanup */ }

  render() {
    return <View>...</View>
  }
}
```

No functional components or hooks. Each page defines a local `interface XxxState`.

## State Management

Import the simple store directly:

```typescript
import { store } from '../../store/simple'
```

- Read: `store.selectedDevice`, `store.provisioningState`
- Write: `store.setDevice(...)`, `store.setConnectionState(...)`
- No `@inject`, `@observer`, or MobX decorators

## BLE Service

```typescript
import { bleService } from '../../services/ble'

// In componentDidMount
this.handleData = (data) => { /* ... */ }
bleService.on('dataReceived', this.handleData)

// In componentWillUnmount — ALWAYS cleanup
bleService.off('dataReceived', this.handleData)
```

Events: `adapterStateChange`, `scanStateChange`, `deviceFound`, `connectionStateChange`, `dataSent`, `dataReceived`, `error`

## Styling

Use Tailwind utility classes in `className`:

```tsx
<View className="min-h-screen bg-gray-50 p-4">
  <Text className="text-lg font-bold text-gray-900">Title</Text>
</View>
```

For CSS that Tailwind cannot generate in WeChat (animations, pseudo-selectors), add to the page's `index.css`:

```css
/* pages/index/index.css */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

Each page MUST import its own `./index.css`.

## File Structure

Each page lives in `src/pages/<name>/`:

```
src/pages/<name>/
├── index.tsx        # Class component
├── index.css        # Supplementary CSS
└── index.config.ts  # Page config
```

Page config:

```typescript
import { definePageConfig } from '@tarojs/taro'

export default definePageConfig({
  navigationBarTitleText: '页面标题'
})
```

## Imports

```typescript
// Taro components
import { View, Text, Button, Input, ScrollView } from '@tarojs/components'

// Taro APIs
import Taro from '@tarojs/taro'

// Utilities — import from utils/parser, NOT from ble.ts static methods
import { encodeWiFiConfig, decodeBLEMessage, arrayBufferToHex } from '../../utils/parser'

// Logger
import { logger } from '../../utils/logger'
```

## TypeScript

- `strictNullChecks: true` — handle null checks
- `noImplicitAny: false` — `any` is acceptable when needed
- `noUnusedLocals: true`, `noUnusedParameters: true`
- `jsx: "react-jsx"` — no need for `import React`

## Conventions

- 2-space indentation
- Singletons: all services/stores are singletons, do not create new instances
- Conditional classes: use template literals `` className={`${condition ? 'class-a' : 'class-b'}`} ``

## Git Workflow

- **Pull before work**: Always `git pull` at the start of a session to ensure you have the latest changes
- **Commit frequently**: Commit after each logical unit of work (bug fix, feature, refactor) — do not accumulate large changes
- **Keep commits atomic**: One concern per commit. Separate "fix BLE listener leak" from "remove duplicated utilities"
- **Commit message style**: Use concise Chinese or English descriptions of what changed and why
