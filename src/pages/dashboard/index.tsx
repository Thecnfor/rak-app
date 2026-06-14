import { Component, PropsWithChildren } from 'react'
import { View, Text, Button, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { dashboardStore, ChainEvent } from '../../store/dashboard'
import { getDevices, executeTask, executeAction, getSchedulerStats, SchedulerStats } from '../../services/kernel'
import { wsService } from '../../services/ws'
import './index.css'

// ─── 快捷动作列表 ──────────────────────────────────────────

const QUICK_ACTIONS = [
  { action: 'wave_hand', label: '招手', icon: '👋' },
  { action: 'shake_head', label: '摇头', icon: '🙅' },
  { action: 'nod', label: '点头', icon: '🙆' },
  { action: 'dance', label: '跳舞', icon: '💃' },
  { action: 'lock_open', label: '开门', icon: '🔓' },
  { action: 'lock_close', label: '关门', icon: '🔒' },
  { action: 'move_forward', label: '前进', icon: '⬆️' },
  { action: 'move_back', label: '后退', icon: '⬇️' },
  { action: 'emergency_stop', label: '急停', icon: '🛑' },
]

// ─── 状态定义 ──────────────────────────────────────────────

interface DashboardState {
  devicesLoaded: boolean
}

// ─── 控制中心页面 ──────────────────────────────────────────

class Dashboard extends Component<PropsWithChildren, DashboardState> {
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null
  private schedulerInterval: number = 2000

  state: DashboardState = {
    devicesLoaded: false,
  }

  componentDidMount() {
    wsService.on('connected', this.handleWsConnected)
    wsService.on('disconnected', this.handleWsDisconnected)
    wsService.on('asr', this.handleAsr)
    wsService.on('voice_reply', this.handleVoiceReply)
    wsService.on('action', this.handleAction)
    wsService.on('chain_error', this.handleChainError)
    wsService.connect()

    this.refreshDevices()
    this.scheduleSchedulerRefresh()
  }

  componentWillUnmount() {
    wsService.off('connected', this.handleWsConnected)
    wsService.off('disconnected', this.handleWsDisconnected)
    wsService.off('asr', this.handleAsr)
    wsService.off('voice_reply', this.handleVoiceReply)
    wsService.off('action', this.handleAction)
    wsService.off('chain_error', this.handleChainError)
    wsService.disconnect()

    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer)
    }
  }

  // ─── WebSocket 事件处理 ──────────────────────────────────

  handleWsConnected = () => {
    dashboardStore.setWsConnected(true)
  }

  handleWsDisconnected = () => {
    dashboardStore.setWsConnected(false)
  }

  handleAsr = (data: { traceId: string; deviceId: string; text: string }) => {
    dashboardStore.addEvent({
      id: `${data.traceId}-asr-${Date.now()}`,
      ts: Date.now(),
      type: 'asr',
      traceId: data.traceId,
      deviceId: data.deviceId,
      text: data.text,
    })
  }

  handleVoiceReply = (data: { traceId: string; deviceId: string; voiceReply: string; latency: number }) => {
    dashboardStore.addEvent({
      id: `${data.traceId}-vr-${Date.now()}`,
      ts: Date.now(),
      type: 'voice_reply',
      traceId: data.traceId,
      deviceId: data.deviceId,
      voiceReply: data.voiceReply,
      latency: data.latency,
    })
  }

  handleAction = (data: { traceId: string; deviceId: string; actions: any[] }) => {
    dashboardStore.addEvent({
      id: `${data.traceId}-act-${Date.now()}`,
      ts: Date.now(),
      type: 'action',
      traceId: data.traceId,
      deviceId: data.deviceId,
      actions: data.actions.map((a: any) => ({
        action: a.action,
        priority: a.priority ?? 0,
        targetDevice: a.target_device || data.deviceId,
      })),
    })
  }

  handleChainError = (data: { traceId: string; error: string }) => {
    dashboardStore.addEvent({
      id: `${data.traceId}-err-${Date.now()}`,
      ts: Date.now(),
      type: 'error',
      traceId: data.traceId,
      deviceId: '',
      error: data.error,
    })
  }

  // ─── 数据拉取 ───────────────────────────────────────────

  refreshDevices = async () => {
    try {
      const devices = await getDevices()
      dashboardStore.setDevices(devices)
    } catch (e: any) {
      console.warn('[dashboard] 获取设备失败:', e.message)
    }
    this.setState({ devicesLoaded: true })
  }

  scheduleSchedulerRefresh = () => {
    this.schedulerTimer = setTimeout(() => this.refreshScheduler(), this.schedulerInterval)
  }

  refreshScheduler = async () => {
    try {
      const stats = await getSchedulerStats()
      dashboardStore.setScheduler(stats)
      this.schedulerInterval = 2000
    } catch {
      this.schedulerInterval = Math.min(this.schedulerInterval * 2, 30000)
    } finally {
      this.scheduleSchedulerRefresh()
    }
  }

  // ─── 操作处理 ───────────────────────────────────────────

  handleCommandInputChange = (e: any) => {
    dashboardStore.setCommandInput(e.detail.value)
  }

  handleExecuteCommand = async () => {
    const input = dashboardStore.commandInput.trim()
    if (!input) {
      Taro.showToast({ title: '请输入指令', icon: 'none' })
      return
    }

    dashboardStore.setExecuting(true)
    dashboardStore.setResult(null)

    try {
      const result = await executeTask(input)
      dashboardStore.setResult(result)
      dashboardStore.setCommandInput('')

      if (result.accepted) {
        Taro.showToast({ title: '任务已接受', icon: 'success' })
      }
    } catch (e: any) {
      Taro.showToast({ title: e.message || '执行失败', icon: 'none' })
    } finally {
      dashboardStore.setExecuting(false)
    }
  }

  handleQuickAction = async (action: string, label: string) => {
    const onlineDevice = dashboardStore.devices.find(d => d.online)
    if (!onlineDevice) {
      Taro.showToast({ title: '无在线设备', icon: 'none' })
      return
    }

    try {
      await executeAction(onlineDevice.device_id, action)
      Taro.showToast({ title: `${label} 已发送`, icon: 'success' })
    } catch (e: any) {
      Taro.showToast({ title: e.message || '发送失败', icon: 'none' })
    }
  }

  // ─── 渲染辅助 ───────────────────────────────────────────

  formatTime(ts: number): string {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  getEventDescription(event: ChainEvent): string {
    switch (event.type) {
      case 'asr':
        return `"${event.text}"`
      case 'voice_reply':
        return `"${event.voiceReply}"`
      case 'action':
        return event.actions?.map(a => `${a.action}(Q${a.priority})`).join(' → ') || ''
      case 'error':
        return event.error || '未知错误'
      default:
        return ''
    }
  }

  getEventTagClass(type: string): string {
    switch (type) {
      case 'asr': return 'r-tag-asr'
      case 'voice_reply': return 'r-tag-voice'
      case 'action': return 'r-tag-action'
      case 'error': return 'r-tag-error'
      default: return 'r-tag-asr'
    }
  }

  getEventLabel(type: string): string {
    switch (type) {
      case 'asr': return 'ASR'
      case 'voice_reply': return '语音'
      case 'action': return '动作'
      case 'error': return '错误'
      default: return '事件'
    }
  }

  // ─── 主渲染 ─────────────────────────────────────────────

  render() {
    const { wsConnected, devices, events, scheduler, executing, lastResult, commandInput } = dashboardStore
    const { devicesLoaded } = this.state
    const onlineCount = devices.filter(d => d.online).length

    return (
      <ScrollView className="min-h-screen" scrollY style={{ background: 'var(--r-bg)' }}>
        <View className="px-5 pt-6 pb-10">
          {/* Header */}
          <Text className="text-[var(--r-text-muted)] text-xs tracking-[0.2em] uppercase mb-1">Raro</Text>
          <Text className="r-title mb-1">控制中心</Text>
          <Text className="r-subtitle mb-6">具身智能设备管理</Text>

          {/* ─── 连接状态栏 ───────────────────────────────── */}
          <View className="r-card mb-4">
            <View className="flex items-center justify-between">
              <View className="flex items-center gap-2">
                <View className={`r-dot ${wsConnected ? 'r-dot-success' : 'r-dot-error'}`} />
                <Text className="text-[var(--r-text-secondary)] text-xs">
                  {wsConnected ? '已连接 go-kernel' : '未连接'}
                </Text>
              </View>
              <View className="flex items-center gap-3">
                <Text className="text-[var(--r-text-muted)] text-xs">
                  在线 <Text className="text-[var(--r-text)] font-medium r-mono">{onlineCount}</Text>/{devices.length}
                </Text>
                <Text className="text-[var(--r-text-faint)] text-xs" onClick={this.refreshDevices}>刷新</Text>
              </View>
            </View>
          </View>

          {/* ─── 设备列表 ─────────────────────────────────── */}
          <View className="mb-4">
            <Text className="r-card-header">设备</Text>
            {!devicesLoaded ? (
              <View className="r-card items-center py-10">
                <Text className="text-[var(--r-text-faint)] text-xs">加载中...</Text>
              </View>
            ) : devices.length === 0 ? (
              <View className="r-card items-center py-10">
                <Text className="text-[var(--r-text-faint)] text-sm">暂无设备</Text>
                <Text className="text-[var(--r-text-faint)] text-xs mt-1">设备将在连接后自动注册</Text>
              </View>
            ) : (
              <ScrollView scrollX className="whitespace-nowrap" enhanced showScrollbar={false}>
                <View className="flex gap-3">
                  {devices.map(device => (
                    <View
                      key={device.device_id}
                      className="r-card r-device-card"
                      style={{ minWidth: '280px' }}
                    >
                      <View className="flex items-center gap-2 mb-2">
                        <View className={`r-dot ${device.online ? 'r-dot-success' : 'r-dot-offline'}`} />
                        <Text className="text-[var(--r-text)] font-medium text-sm r-mono">{device.device_id}</Text>
                      </View>
                      <Text className={`text-xs ${device.online ? 'text-[var(--r-success)]' : 'text-[var(--r-text-faint)]'}`}>
                        {device.online ? '在线' : '离线'}
                      </Text>
                      {device.last_state && (
                        <Text className="text-[var(--r-text-faint)] text-xs mt-1">
                          {device.last_state}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* ─── 快捷动作 ─────────────────────────────────── */}
          <View className="mb-4">
            <Text className="r-card-header">快捷动作</Text>
            <View className="r-action-grid">
              {QUICK_ACTIONS.map(item => (
                <View
                  key={item.action}
                  className="r-action-item"
                  onClick={() => this.handleQuickAction(item.action, item.label)}
                  hoverClass="r-action-hover"
                >
                  <Text className="text-2xl mb-1">{item.icon}</Text>
                  <Text className="text-[var(--r-text)] text-xs font-medium">{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ─── 自然语言指令 ─────────────────────────────── */}
          <View className="r-card mb-4">
            <Text className="r-card-header">自然语言指令</Text>

            <View className="flex gap-2 mb-4">
              <Input
                className="r-input flex-1"
                placeholder="输入指令，如：开门然后跳舞"
                value={commandInput}
                onInput={this.handleCommandInputChange}
                confirmType="send"
                onConfirm={this.handleExecuteCommand}
              />
              <Button
                className={`r-btn-send ${executing ? 'r-btn-send-disabled' : ''}`}
                onClick={this.handleExecuteCommand}
                disabled={executing}
              >
                {executing ? '...' : '发送'}
              </Button>
            </View>

            {/* 执行结果 */}
            {lastResult && (
              <View className="r-result-panel">
                <View className="flex items-center gap-2 mb-2">
                  <View className={`r-dot ${lastResult.accepted ? 'r-dot-success' : 'r-dot-error'}`} />
                  <Text className="text-[var(--r-text-secondary)] text-xs r-mono">
                    {lastResult.accepted ? '已接受' : '已拒绝'} · {lastResult.trace_id.slice(0, 12)}
                  </Text>
                </View>
                {lastResult.results.map((r, i) => (
                  <View key={i} className="flex items-center gap-2 ml-5 mb-1">
                    <Text className="text-[var(--r-text-faint)] text-xs">→</Text>
                    <Text className="text-[var(--r-text)] text-xs r-mono">
                      {r.action}({r.target_device})
                    </Text>
                    <Text className={`text-xs ${r.status === 'ok' ? 'text-[var(--r-success)]' : 'text-[var(--r-error)]'}`}>
                      {r.status === 'ok' ? '✓' : r.error || '✗'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ─── 实时事件流 ───────────────────────────────── */}
          <View className="r-card mb-4">
            <View className="flex items-center justify-between mb-4">
              <Text className="r-card-header" style={{ marginBottom: 0 }}>
                实时事件 · <Text className="r-mono">{events.length}</Text>
              </Text>
              <Text className="text-[var(--r-text-faint)] text-xs" onClick={() => dashboardStore.clearEvents()}>
                清空
              </Text>
            </View>

            {events.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-[var(--r-text-faint)] text-xs">等待链路事件...</Text>
              </View>
            ) : (
              <View>
                {events.slice(0, 20).map(event => (
                  <View key={event.id} className="r-event-item">
                    <Text className="text-[var(--r-text-faint)] text-xs r-mono" style={{ width: '120px' }}>
                      {this.formatTime(event.ts)}
                    </Text>
                    <View className={`r-tag ${this.getEventTagClass(event.type)}`}>
                      <Text>{this.getEventLabel(event.type)}</Text>
                    </View>
                    <Text className="text-[var(--r-text-secondary)] text-xs flex-1 ml-2">
                      {this.getEventDescription(event)}
                    </Text>
                    {event.latency && event.latency > 0 && (
                      <Text className="text-[var(--r-text-faint)] text-xs r-mono ml-2">
                        {event.latency}ms
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ─── PA-HPS 调度器 ────────────────────────────── */}
          {scheduler && (
            <View className="r-card mb-4">
              <Text className="r-card-header">PA-HPS 调度器</Text>

              {/* 队列长度 */}
              <View className="flex gap-3 mb-4">
                <View className="r-queue-card r-queue-q0">
                  <Text className="text-xs text-[var(--r-text-muted)]">Q0 实时</Text>
                  <Text className="r-stat text-[var(--r-error)]">{scheduler.q0_len}</Text>
                </View>
                <View className="r-queue-card r-queue-q1">
                  <Text className="text-xs text-[var(--r-text-muted)]">Q1 交互</Text>
                  <Text className="r-stat text-[var(--r-warning)]">{scheduler.q1_len}</Text>
                </View>
                <View className="r-queue-card r-queue-q2">
                  <Text className="text-xs text-[var(--r-text-muted)]">Q2 管理</Text>
                  <Text className="r-stat text-[var(--r-text-muted)]">{scheduler.q2_len}</Text>
                </View>
              </View>

              {/* 统计 */}
              <View className="r-stats-row">
                <Text className="text-[var(--r-text-secondary)] text-xs r-mono">处理={scheduler.processed}</Text>
                <Text className="text-[var(--r-text-faint)] text-xs">·</Text>
                <Text className="text-[var(--r-success)] text-xs r-mono">完成={scheduler.completed}</Text>
                <Text className="text-[var(--r-text-faint)] text-xs">·</Text>
                <Text className="text-[var(--r-error)] text-xs r-mono">丢弃={scheduler.dropped}</Text>
                <Text className="text-[var(--r-text-faint)] text-xs">·</Text>
                <Text className="text-[var(--r-warning)] text-xs r-mono">老化={scheduler.aged}</Text>
              </View>
            </View>
          )}

          {/* ─── 系统架构 ─────────────────────────────────── */}
          <View className="r-card">
            <Text className="r-card-header">系统架构</Text>
            <View className="r-mono text-[var(--r-text-muted)] text-xs leading-relaxed">
              <Text>{'云端推理 → LLM 任务分解 → 认知路由器 → HFT\n'}</Text>
              <Text>{'边缘调度 → PA-HPS 三级队列 → MQTT → ESP32\n'}</Text>
              <Text>{'状态回传 → 传感器 → 网络感知 → 边缘自治\n'}</Text>
              <Text className="text-[var(--r-text-faint)]">{'端到端 ≤ 500ms · Q0 ≤ 20ms'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    )
  }
}

export default Dashboard
