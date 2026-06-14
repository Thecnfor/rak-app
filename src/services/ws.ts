import Taro from '@tarojs/taro'
import { WS_URL } from '../config/env'

// ─── WebSocket 事件类型 ──────────────────────────────────────

export interface WSAsrEvent {
  traceId: string
  deviceId: string
  text: string
}

export interface WSVoiceReplyEvent {
  traceId: string
  deviceId: string
  voiceReply: string
  latency: number
}

export interface WSActionEvent {
  traceId: string
  deviceId: string
  actions: { action: string; priority: number; targetDevice: string }[]
}

export interface WSChainErrorEvent {
  traceId: string
  error: string
  code: string
}

export interface WSDeviceStateEvent {
  deviceId: string
  status: string
  data: Record<string, unknown>
}

export interface WSRawMessage {
  version?: string
  type: string
  trace_id?: string
  source?: string
  target?: string
  timestamp?: number
  data?: unknown
}

// 事件映射
interface WSEventMap {
  connected: null
  disconnected: null
  asr: WSAsrEvent
  voice_reply: WSVoiceReplyEvent
  action: WSActionEvent
  chain_error: WSChainErrorEvent
  device_state: WSDeviceStateEvent
  state: WSRawMessage
  message: WSRawMessage
  error: unknown
}

type WSEventCallback<T = unknown> = (data: T) => void

/**
 * go-kernel WebSocket 实时事件服务。
 * 使用 Taro.connectSocket() 连接，自动重连。
 */
class WSService {
  private socketTask: Taro.SocketTask | null = null
  private connected: boolean = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private listeners: Map<string, WSEventCallback[]> = new Map()
  private shouldReconnect: boolean = true

  on<K extends keyof WSEventMap>(event: K, callback: WSEventCallback<WSEventMap[K]>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback as WSEventCallback)
  }

  off<K extends keyof WSEventMap>(event: K, callback: WSEventCallback<WSEventMap[K]>) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback as WSEventCallback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  private emit<K extends keyof WSEventMap>(event: K, data: WSEventMap[K]) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(cb => cb(data))
    }
  }

  /** 连接 WebSocket */
  connect() {
    if (this.connected || this.socketTask) return
    this.shouldReconnect = true

    console.log('[ws] 正在连接 go-kernel WebSocket...')

    this.socketTask = Taro.connectSocket({
      url: WS_URL,
      success: () => console.log('[ws] connectSocket 调用成功'),
      fail: (err) => {
        console.error('[ws] connectSocket 失败:', err)
        this.scheduleReconnect()
      },
    })

    this.socketTask.onOpen(() => {
      console.log('[ws] WebSocket 已连接')
      this.connected = true
      this.emit('connected', null)
    })

    this.socketTask.onMessage((res) => {
      try {
        const msg: WSRawMessage = JSON.parse(res.data as string)
        this.handleMessage(msg)
      } catch {
        console.warn('[ws] 收到非 JSON 消息，已忽略')
      }
    })

    this.socketTask.onClose(() => {
      console.log('[ws] WebSocket 断开')
      this.connected = false
      this.socketTask = null
      this.emit('disconnected', null)
      this.scheduleReconnect()
    })

    this.socketTask.onError((err) => {
      console.error('[ws] WebSocket 错误:', err)
      this.connected = false
      this.emit('error', err)
    })
  }

  /** 断开连接 */
  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socketTask) {
      this.socketTask.close({})
      this.socketTask = null
    }
    this.connected = false
  }

  /** 是否已连接 */
  isConnected(): boolean {
    return this.connected
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return
    if (this.reconnectTimer) return

    console.log('[ws] 3s 后重连...')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.socketTask = null
      this.connect()
    }, 3000)
  }

  private handleMessage(msg: WSRawMessage) {
    // 处理 state 类型消息（设备状态更新、ASR 结果、语音回复等）
    if (msg.type === 'state' && msg.data) {
      const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data as Record<string, unknown>

      // 语音回复
      if (data.status === 'voice_reply' || data.voice_reply) {
        this.emit('voice_reply', {
          traceId: msg.trace_id || '',
          deviceId: (data.device_id as string) || '',
          voiceReply: (data.voice_reply as string) || (data.text as string) || '',
          latency: (data.latency_ms as number) || 0,
        })
      }

      // ASR 结果
      if (data.text && data.status !== 'voice_reply') {
        this.emit('asr', {
          traceId: msg.trace_id || '',
          deviceId: (data.device_id as string) || '',
          text: data.text as string,
        })
      }

      // 设备状态更新
      if (data.device_id && data.status) {
        this.emit('device_state', {
          deviceId: data.device_id as string,
          status: data.status as string,
          data,
        })
      }

      // 动作执行结果
      if (data.actions && Array.isArray(data.actions)) {
        this.emit('action', {
          traceId: msg.trace_id || '',
          deviceId: (data.device_id as string) || '',
          actions: data.actions as WSActionEvent['actions'],
        })
      }

      // 通用 state 事件
      this.emit('state', msg)
    }

    // 处理 error 类型消息
    if (msg.type === 'error') {
      const errData = msg.data as Record<string, unknown> | undefined
      this.emit('chain_error', {
        traceId: msg.trace_id || '',
        error: (errData?.message as string) || '未知错误',
        code: (errData?.code as string) || 'UNKNOWN',
      })
    }

    // 所有消息的原始事件
    this.emit('message', msg)
  }
}

export const wsService = new WSService()
export default WSService
