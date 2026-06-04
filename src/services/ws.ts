import Taro from '@tarojs/taro'

// go-kernel WebSocket 地址
const WS_URL = 'ws://116.205.183.125:8080/ws'

type WSCallback = (data: any) => void

/**
 * go-kernel WebSocket 实时事件服务。
 * 使用 Taro.connectSocket() 连接，自动重连。
 */
class WSService {
  private socketTask: Taro.SocketTask | null = null
  private connected: boolean = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private listeners: Map<string, WSCallback[]> = new Map()
  private shouldReconnect: boolean = true

  on(event: string, callback: WSCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: WSCallback) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: any) {
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
        const msg = JSON.parse(res.data as string)
        this.handleMessage(msg)
      } catch (e) {
        // 忽略非 JSON 消息
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

  private handleMessage(msg: any) {
    // 处理 state 类型消息（设备状态更新、ASR 结果、语音回复等）
    if (msg.type === 'state' && msg.data) {
      const data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data

      // 语音回复
      if (data.status === 'voice_reply' || data.voice_reply) {
        this.emit('voice_reply', {
          traceId: msg.trace_id || '',
          deviceId: data.device_id || '',
          voiceReply: data.voice_reply || data.text || '',
          latency: data.latency_ms || 0,
        })
      }

      // ASR 结果
      if (data.text && data.status !== 'voice_reply') {
        this.emit('asr', {
          traceId: msg.trace_id || '',
          deviceId: data.device_id || '',
          text: data.text,
        })
      }

      // 设备状态更新
      if (data.device_id && data.status) {
        this.emit('device_state', {
          deviceId: data.device_id,
          status: data.status,
          data,
        })
      }

      // 动作执行结果
      if (data.actions && Array.isArray(data.actions)) {
        this.emit('action', {
          traceId: msg.trace_id || '',
          deviceId: data.device_id || '',
          actions: data.actions,
        })
      }

      // 通用 state 事件
      this.emit('state', msg)
    }

    // 处理 error 类型消息
    if (msg.type === 'error') {
      this.emit('chain_error', {
        traceId: msg.trace_id || '',
        error: msg.data?.message || '未知错误',
        code: msg.data?.code || 'UNKNOWN',
      })
    }

    // 所有消息的原始事件
    this.emit('message', msg)
  }
}

export const wsService = new WSService()
export default WSService
